import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-RDS-2';
const RULE_SERVICE = 'rds';
const RULE_MESSAGE = 'RDS DB instances should not remain idle for 7 days.';

/** Flag RDS DB instances with no observed database connections in the last 7 days. */
export const rdsIdleInstanceRule = createRule({
  id: RULE_ID,
  name: 'RDS DB Instance Idle',
  description: 'Flag RDS DB instances that have no database connections in the last 7 days.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-rds-instance-activity'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-rds-instance-activity')
      .filter((instance) => instance.maxDatabaseConnectionsLast7Days === 0)
      .map((instance) => createFindingMatch(instance.dbInstanceIdentifier, instance.region, instance.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
