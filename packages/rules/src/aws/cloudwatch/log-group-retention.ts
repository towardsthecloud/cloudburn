import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-CLOUDWATCH-1';
const RULE_SERVICE = 'cloudwatch';
const RULE_MESSAGE =
  'CloudWatch log groups should define a retention policy unless AWS manages lifecycle automatically.';

/** Flag CloudWatch log groups that do not define retention and are not delivery-managed. */
export const cloudWatchLogGroupRetentionRule = createRule({
  id: RULE_ID,
  name: 'CloudWatch Log Group Missing Retention',
  description: 'Flag CloudWatch log groups that do not define retention and are not delivery-managed.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-cloudwatch-log-groups'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-cloudwatch-log-groups')
      .filter((logGroup) => logGroup.retentionInDays === undefined && logGroup.logGroupClass !== 'DELIVERY')
      .map((logGroup) => createFindingMatch(logGroup.logGroupName, logGroup.region, logGroup.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
