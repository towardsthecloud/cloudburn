import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-RDS-9';
const RULE_SERVICE = 'rds';
const RULE_MESSAGE = 'Stopped RDS DB instances should be reviewed for cleanup.';

/** Flag RDS DB instances that remain in the stopped state. */
export const rdsStoppedInstanceRule = createRule({
  id: RULE_ID,
  name: 'RDS DB Instance Stopped',
  description: 'Flag RDS DB instances that are currently in the stopped state for cleanup review.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-rds-instances'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-rds-instances')
      .filter((instance) => instance.dbInstanceStatus === 'stopped')
      .map((instance) => createFindingMatch(instance.dbInstanceIdentifier, instance.region, instance.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
