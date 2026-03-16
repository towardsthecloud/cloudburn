import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EC2-11';
const RULE_SERVICE = 'ec2';
const RULE_MESSAGE = 'EC2 large instances of 2xlarge or greater should be reviewed.';
// Treat 2xlarge and above as the right-sizing review threshold.
const LARGE_INSTANCE_MIN_XLARGE_MULTIPLIER = 2;

const isLargeInstanceSize = (instanceType: string): boolean => {
  const size = instanceType.split('.').slice(1).join('.').toLowerCase();

  if (!size) {
    return false;
  }

  if (size.startsWith('metal')) {
    return true;
  }

  if (size === 'xlarge') {
    return false;
  }

  const match = size.match(/^(\d+)xlarge$/);

  if (!match?.[1]) {
    return false;
  }

  return Number.parseInt(match[1], 10) >= LARGE_INSTANCE_MIN_XLARGE_MULTIPLIER;
};

/** Flag EC2 instances that cross the large-instance review threshold. */
export const ec2LargeInstanceRule = createRule({
  id: RULE_ID,
  name: 'EC2 Instance Large Size',
  description: 'Flag EC2 instances that are sized at 2xlarge or above so they can be right-sized intentionally.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ec2-instances'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ec2-instances')
      .filter((instance) => isLargeInstanceSize(instance.instanceType))
      .map((instance) => createFindingMatch(instance.instanceId, instance.region, instance.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
