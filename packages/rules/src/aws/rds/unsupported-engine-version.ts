import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-RDS-6';
const RULE_SERVICE = 'rds';
const RULE_MESSAGE =
  'RDS MySQL 5.7 and PostgreSQL 11 DB instances should be upgraded to avoid extended support charges.';

const isUnsupportedRdsEngineVersion = (engine?: string, engineVersion?: string): boolean => {
  const normalizedEngine = engine?.toLowerCase();

  if (!normalizedEngine || !engineVersion) {
    return false;
  }

  return (
    (normalizedEngine === 'mysql' && engineVersion.startsWith('5.7')) ||
    (normalizedEngine === 'postgres' && engineVersion.startsWith('11'))
  );
};

/** Flag RDS DB instances on engine versions that incur extended support charges. */
export const rdsUnsupportedEngineVersionRule = createRule({
  id: RULE_ID,
  name: 'RDS DB Instance Unsupported Engine Version',
  description:
    'Flag RDS MySQL 5.7 and PostgreSQL 11 DB instances that can incur extended support charges until they are upgraded.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-rds-instances'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-rds-instances')
      .filter((instance) => isUnsupportedRdsEngineVersion(instance.engine, instance.engineVersion))
      .map((instance) => createFindingMatch(instance.dbInstanceIdentifier, instance.region, instance.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
