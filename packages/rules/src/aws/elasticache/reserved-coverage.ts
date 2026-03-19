import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-ELASTICACHE-1';
const RULE_SERVICE = 'elasticache';
const RULE_MESSAGE = 'Long-running ElastiCache clusters should have reserved node coverage.';
const DAY_MS = 24 * 60 * 60 * 1000;
// Review steady-state cache clusters twice a year for reservation fit.
const LONG_RUNNING_CLUSTER_DAYS = 180;
const ELASTICACHE_SIZE_NORMALIZED_UNITS: Record<string, number> = {
  '10xlarge': 80,
  '12xlarge': 96,
  '16xlarge': 128,
  '18xlarge': 144,
  '24xlarge': 192,
  '2xlarge': 16,
  '4xlarge': 32,
  '8xlarge': 64,
  large: 4,
  medium: 2,
  micro: 0.5,
  nano: 0.25,
  small: 1,
  xlarge: 8,
};

const normalizeElastiCacheEngine = (value: string | undefined): string | null => {
  const normalized = value?.toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.includes('valkey')) {
    return 'valkey';
  }

  if (normalized.includes('redis')) {
    return 'redis';
  }

  if (normalized.includes('memcached')) {
    return 'memcached';
  }

  return null;
};

type ElastiCacheCapacityShape = {
  key: string;
  normalizedUnits: number;
} | null;

const createCoverageKey = (region: string, capacityKey: string, engine: string): string =>
  `${region}:${capacityKey}:${engine}`;

const normalizeElastiCacheCapacityShape = (cacheNodeType: string): ElastiCacheCapacityShape => {
  const match = /^(cache\.[^.]+)\.(.+)$/u.exec(cacheNodeType);

  if (!match) {
    return {
      key: `type:${cacheNodeType}`,
      normalizedUnits: 1,
    };
  }

  const family = match[1];
  const size = match[2];

  if (!family || !size) {
    return {
      key: `type:${cacheNodeType}`,
      normalizedUnits: 1,
    };
  }

  const normalizedUnits = ELASTICACHE_SIZE_NORMALIZED_UNITS[size.toLowerCase()];

  // Reserved nodes are size-flexible within a family only when AWS exposes a
  // known normalized size. Unknown sizes fall back to exact-type matching.
  if (normalizedUnits === undefined) {
    return {
      key: `type:${cacheNodeType}`,
      normalizedUnits: 1,
    };
  }

  return {
    key: `family:${family}`,
    normalizedUnits,
  };
};

const getCoverageCandidateEngines = (engine: string): string[] =>
  engine === 'valkey' ? ['valkey', 'redis', '*'] : [engine, '*'];

const consumeCoverage = (
  remainingCoverage: Map<string, number>,
  region: string,
  capacityKey: string,
  engine: string,
  requiredUnits: number,
): boolean => {
  let remainingRequiredUnits = requiredUnits;

  for (const candidateEngine of getCoverageCandidateEngines(engine)) {
    const coverageKey = createCoverageKey(region, capacityKey, candidateEngine);
    const availableUnits = remainingCoverage.get(coverageKey) ?? 0;

    if (availableUnits <= 0) {
      continue;
    }

    const consumedUnits = Math.min(availableUnits, remainingRequiredUnits);
    remainingCoverage.set(coverageKey, availableUnits - consumedUnits);
    remainingRequiredUnits -= consumedUnits;

    if (remainingRequiredUnits === 0) {
      return true;
    }
  }

  return false;
};

/** Flag long-running ElastiCache clusters that lack reserved-node coverage. */
export const elastiCacheReservedCoverageRule = createRule({
  id: RULE_ID,
  name: 'ElastiCache Cluster Missing Reserved Coverage',
  description: 'Flag long-running ElastiCache clusters that do not have matching active reserved-node coverage.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-elasticache-clusters', 'aws-elasticache-reserved-nodes'],
  evaluateLive: ({ resources }) => {
    const now = Date.now();
    const cutoff = now - LONG_RUNNING_CLUSTER_DAYS * DAY_MS;
    const remainingCoverage = new Map<string, number>();

    for (const reservedNode of resources.get('aws-elasticache-reserved-nodes')) {
      if (reservedNode.state !== 'active') {
        continue;
      }

      const capacityShape = normalizeElastiCacheCapacityShape(reservedNode.cacheNodeType);

      if (!capacityShape) {
        continue;
      }

      // When the reserved-node engine is unavailable, fall back to node-type-only coverage.
      const engine = normalizeElastiCacheEngine(reservedNode.productDescription) ?? '*';
      const coverageKey = createCoverageKey(reservedNode.region, capacityShape.key, engine);

      remainingCoverage.set(
        coverageKey,
        (remainingCoverage.get(coverageKey) ?? 0) + reservedNode.cacheNodeCount * capacityShape.normalizedUnits,
      );
    }

    const findings = resources
      .get('aws-elasticache-clusters')
      .filter((cluster) => {
        const createTime = cluster.cacheClusterCreateTime ? Date.parse(cluster.cacheClusterCreateTime) : Number.NaN;

        if (
          cluster.cacheClusterStatus !== 'available' ||
          Number.isNaN(createTime) ||
          createTime > cutoff ||
          cluster.numCacheNodes <= 0
        ) {
          return false;
        }

        const normalizedEngine = normalizeElastiCacheEngine(cluster.engine) ?? '*';
        const capacityShape = normalizeElastiCacheCapacityShape(cluster.cacheNodeType);

        if (!capacityShape) {
          return false;
        }

        return !consumeCoverage(
          remainingCoverage,
          cluster.region,
          capacityShape.key,
          normalizedEngine,
          cluster.numCacheNodes * capacityShape.normalizedUnits,
        );
      })
      .map((cluster) => createFindingMatch(cluster.cacheClusterId, cluster.region, cluster.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
