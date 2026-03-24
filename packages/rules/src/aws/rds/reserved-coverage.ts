import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-RDS-3';
const RULE_SERVICE = 'rds';
const RULE_MESSAGE = 'Long-running RDS DB instances should have reserved instance coverage.';
const DAY_MS = 24 * 60 * 60 * 1000;
// Review steady-state databases twice a year for reservation fit.
const LONG_RUNNING_INSTANCE_DAYS = 180;

const normalizeRdsEngine = (value: string | undefined): string | null => {
  const normalized = value?.toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.includes('aurora-mysql') || normalized.includes('mysql')) {
    return 'mysql';
  }

  if (normalized.includes('aurora-postgresql') || normalized.includes('postgres')) {
    return 'postgres';
  }

  return normalized;
};

const createCoverageKey = (region: string, instanceClass: string, multiAz: boolean, engine: string): string =>
  `${region}:${instanceClass}:${multiAz ? 'multi-az' : 'single-az'}:${engine}`;

const getCoverageCandidateEngines = (engine: string): string[] => [engine, '*'];

const consumeCoverage = (
  remainingCoverage: Map<string, number>,
  region: string,
  instanceClass: string,
  multiAz: boolean,
  engine: string,
): boolean => {
  for (const candidateEngine of getCoverageCandidateEngines(engine)) {
    const coverageKey = createCoverageKey(region, instanceClass, multiAz, candidateEngine);
    const availableCount = remainingCoverage.get(coverageKey) ?? 0;

    if (availableCount <= 0) {
      continue;
    }

    remainingCoverage.set(coverageKey, availableCount - 1);
    return true;
  }

  return false;
};

/** Flag long-running RDS DB instances that lack active reserved-instance coverage. */
export const rdsReservedCoverageRule = createRule({
  id: RULE_ID,
  name: 'RDS DB Instance Missing Reserved Coverage',
  description: 'Flag long-running RDS DB instances that do not have matching active reserved-instance coverage.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-rds-instances', 'aws-rds-reserved-instances'],
  evaluateLive: ({ resources }) => {
    const now = Date.now();
    const cutoff = now - LONG_RUNNING_INSTANCE_DAYS * DAY_MS;
    const remainingCoverage = new Map<string, number>();

    for (const reservedInstance of resources.get('aws-rds-reserved-instances')) {
      if (reservedInstance.state !== 'active' || reservedInstance.instanceCount <= 0) {
        continue;
      }

      const normalizedEngine = normalizeRdsEngine(reservedInstance.productDescription) ?? '*';
      const coverageKey = createCoverageKey(
        reservedInstance.region,
        reservedInstance.instanceClass,
        reservedInstance.multiAz ?? false,
        normalizedEngine,
      );

      remainingCoverage.set(coverageKey, (remainingCoverage.get(coverageKey) ?? 0) + reservedInstance.instanceCount);
    }

    const findings = resources
      .get('aws-rds-instances')
      .filter((instance) => {
        const createTime = instance.instanceCreateTime ? Date.parse(instance.instanceCreateTime) : Number.NaN;

        if (instance.dbInstanceStatus !== 'available' || Number.isNaN(createTime) || createTime > cutoff) {
          return false;
        }

        const normalizedEngine = normalizeRdsEngine(instance.engine) ?? '*';

        return !consumeCoverage(
          remainingCoverage,
          instance.region,
          instance.instanceClass,
          instance.multiAz ?? false,
          normalizedEngine,
        );
      })
      .map((instance) => createFindingMatch(instance.dbInstanceIdentifier, instance.region, instance.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
