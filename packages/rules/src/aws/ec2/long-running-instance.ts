import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EC2-9';
const RULE_SERVICE = 'ec2';
const RULE_MESSAGE = 'EC2 instances running for 180 days or longer should be reviewed.';
const DAY_MS = 24 * 60 * 60 * 1000;
// Review long-lived instances twice a year for refresh, rightsizing, and replacement.
const LONG_RUNNING_INSTANCE_DAYS = 180;

/** Flag EC2 instances that have been running long enough to warrant a review. */
export const ec2LongRunningInstanceRule = createRule({
  id: RULE_ID,
  name: 'EC2 Instance Long Running',
  description: 'Flag EC2 instances whose launch time is at least 180 days old.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ec2-instances'],
  evaluateLive: ({ resources }) => {
    const now = Date.now();
    const cutoff = now - LONG_RUNNING_INSTANCE_DAYS * DAY_MS;

    const findings = resources
      .get('aws-ec2-instances')
      .filter((instance) => {
        const launchTime = instance.launchTime ? Date.parse(instance.launchTime) : Number.NaN;

        return instance.state === 'running' && !Number.isNaN(launchTime) && launchTime <= cutoff;
      })
      .map((instance) => createFindingMatch(instance.instanceId, instance.region, instance.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
