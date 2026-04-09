import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EC2-13';
const RULE_SERVICE = 'ec2';
const RULE_MESSAGE = 'Stopped EC2 instances with a parsed stop time older than 30 days should be reviewed for cleanup.';

const DAY_MS = 24 * 60 * 60 * 1000;
const STOPPED_INSTANCE_MAX_AGE_DAYS = 30;

/** Flag stopped EC2 instances whose parsed stop time is older than 30 days. */
export const ec2StoppedInstanceRule = createRule({
  id: RULE_ID,
  name: 'EC2 Instance Stopped',
  description: 'Flag stopped EC2 instances whose parsed stop time is at least 30 days old.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ec2-instances'],
  evaluateLive: ({ resources }) => {
    const cutoff = Date.now() - STOPPED_INSTANCE_MAX_AGE_DAYS * DAY_MS;
    const findings = resources
      .get('aws-ec2-instances')
      .filter((instance) => {
        if (instance.state !== 'stopped' || !instance.stoppedAt) {
          return false;
        }

        const stoppedAt = Date.parse(instance.stoppedAt);

        return Number.isFinite(stoppedAt) && stoppedAt <= cutoff;
      })
      .map((instance) => createFindingMatch(instance.instanceId, instance.region, instance.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
