import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';
import { parseElastiCacheNodeType } from './shared.js';

const RULE_ID = 'CLDBRN-AWS-ELASTICACHE-3';
const RULE_SERVICE = 'elasticache';
const RULE_SEVERITY = 'medium' as const;
const RULE_MESSAGE = 'ElastiCache clusters should use current-generation node types.';

// Node families AWS documents as previous generation for ElastiCache. Every one
// has a current-generation successor at an equal or lower hourly rate.
const PREVIOUS_GENERATION_ELASTICACHE_FAMILIES = new Set([
  'cache.t1',
  'cache.t2',
  'cache.m1',
  'cache.m2',
  'cache.m3',
  'cache.m4',
  'cache.c1',
  'cache.r3',
  'cache.r4',
]);

const isPreviousGenerationCacheNodeType = (cacheNodeType: string | null | undefined): boolean => {
  if (cacheNodeType === null || cacheNodeType === undefined) {
    return false;
  }

  const parsed = parseElastiCacheNodeType(cacheNodeType.toLowerCase());

  return parsed !== null && PREVIOUS_GENERATION_ELASTICACHE_FAMILIES.has(parsed.family);
};

/** Flag ElastiCache clusters that still run on previous-generation node families. */
export const elastiCacheNodeTypeCurrentGenRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'ElastiCache Cluster Node Type Not Current Generation',
  description:
    'Flag ElastiCache clusters on previous-generation node families, where a current-generation family delivers better price performance.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery', 'iac'],
  discoveryDependencies: ['aws-elasticache-clusters'],
  staticDependencies: ['aws-elasticache-clusters'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-elasticache-clusters')
      .filter(
        (cluster) =>
          cluster.cacheClusterStatus === 'available' && isPreviousGenerationCacheNodeType(cluster.cacheNodeType),
      )
      .map((cluster) => createFindingMatch(cluster.cacheClusterId, cluster.region, cluster.accountId));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-elasticache-clusters')
      .filter((cluster) => isPreviousGenerationCacheNodeType(cluster.cacheNodeType))
      .map((cluster) => createFindingMatch(cluster.resourceId, undefined, undefined, cluster.location));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'iac',
      findings,
    );
  },
});
