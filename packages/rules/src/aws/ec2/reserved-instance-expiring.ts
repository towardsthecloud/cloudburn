import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EC2-7';
const RULE_SERVICE = 'ec2';
const RULE_MESSAGE = 'EC2 reserved instances expiring within 60 days should be reviewed.';
const DAY_MS = 24 * 60 * 60 * 1000;
// Review reserved-instance renewals roughly two billing cycles ahead.
const RESERVED_INSTANCE_EXPIRING_WINDOW_DAYS = 60;

/** Flag active reserved instances that are approaching their end date. */
export const ec2ReservedInstanceExpiringRule = createRule({
  id: RULE_ID,
  name: 'EC2 Reserved Instance Expiring',
  description: 'Flag active EC2 reserved instances whose end date is within the next 60 days.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ec2-reserved-instances'],
  evaluateLive: ({ resources }) => {
    const now = Date.now();
    const cutoff = now + RESERVED_INSTANCE_EXPIRING_WINDOW_DAYS * DAY_MS;

    const findings = resources
      .get('aws-ec2-reserved-instances')
      .filter((instance) => {
        const endTime = instance.endTime ? Date.parse(instance.endTime) : Number.NaN;

        if (instance.state !== 'active' || Number.isNaN(endTime)) {
          return false;
        }

        return endTime > now && endTime <= cutoff;
      })
      .map((instance) => createFindingMatch(instance.reservedInstancesId, instance.region, instance.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
