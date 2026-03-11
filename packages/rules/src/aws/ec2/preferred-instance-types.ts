import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';
import { getAwsEc2PreferredInstanceFamilyState } from './preferred-instance-families.js';

const RULE_ID = 'CLDBRN-AWS-EC2-1';
const RULE_SERVICE = 'ec2';
const RULE_MESSAGE = 'EC2 instances should use preferred instance types.';
const INSTANCE_TYPE_PATTERN = /^[a-z0-9-]+\.[a-z0-9-]+$/i;

const getLiteralInstanceType = (value: unknown): string | null =>
  typeof value === 'string' && INSTANCE_TYPE_PATTERN.test(value) ? value.toLowerCase() : null;

const getPreferredInstanceState = (instanceType: unknown): 'preferred' | 'non-preferred' | 'unclassified' => {
  const literalInstanceType = getLiteralInstanceType(instanceType);

  if (!literalInstanceType) {
    return 'unclassified';
  }

  return getAwsEc2PreferredInstanceFamilyState(literalInstanceType);
};

/** Flag direct EC2 instances that do not use the curated preferred instance families. */
export const ec2PreferredInstanceTypeRule = createRule({
  id: RULE_ID,
  name: 'EC2 Instance Type Not Preferred',
  description: 'Flag direct EC2 instances that do not use curated preferred instance types.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['iac', 'discovery'],
  discoveryDependencies: ['aws-ec2-instances'],
  staticDependencies: ['aws-ec2-instances'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ec2-instances')
      .filter((instance) => getPreferredInstanceState(instance.instanceType) === 'non-preferred')
      .map((instance) => createFindingMatch(instance.instanceId, instance.region, instance.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-ec2-instances')
      .filter((instance) => getPreferredInstanceState(instance.instanceType) === 'non-preferred')
      .map((instance) => createFindingMatch(instance.resourceId, undefined, undefined, instance.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
