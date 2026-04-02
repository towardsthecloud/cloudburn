import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EC2-12';
const RULE_SERVICE = 'ec2';
const RULE_MESSAGE = 'EC2 reserved instances that expired within the last 30 days should be reviewed.';
const DAY_MS = 24 * 60 * 60 * 1000;
const RESERVED_INSTANCE_RECENTLY_EXPIRED_WINDOW_DAYS = 30;

/** Flag EC2 reserved instances whose end date falls within the previous 30 days. */
export const ec2ReservedInstanceRecentlyExpiredRule = createRule({
  id: RULE_ID,
  name: 'EC2 Reserved Instance Recently Expired',
  description: 'Flag EC2 reserved instances whose end date fell within the last 30 days.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ec2-reserved-instances'],
  evaluateLive: ({ resources }) => {
    const now = Date.now();
    const cutoff = now - RESERVED_INSTANCE_RECENTLY_EXPIRED_WINDOW_DAYS * DAY_MS;

    const findings = resources
      .get('aws-ec2-reserved-instances')
      .filter((instance) => {
        const endTime = instance.endTime ? Date.parse(instance.endTime) : Number.NaN;

        if (Number.isNaN(endTime)) {
          return false;
        }

        return endTime < now && endTime >= cutoff;
      })
      .map((instance) => createFindingMatch(instance.reservedInstancesId, instance.region, instance.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
