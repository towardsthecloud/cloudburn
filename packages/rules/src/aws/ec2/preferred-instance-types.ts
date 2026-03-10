import {
  createFinding,
  createFindingMatch,
  createRule,
  createStaticFindingMatch,
  isRecord,
} from '../../shared/helpers.js';
import { getAwsEc2PreferredInstanceFamilyState } from './preferred-instance-families.js';

const RULE_ID = 'CLDBRN-AWS-EC2-1';
const RULE_SERVICE = 'ec2';
const RULE_MESSAGE = 'EC2 instances should use preferred instance types.';
const TERRAFORM_INSTANCE_TYPE = 'aws_instance';
const CLOUDFORMATION_INSTANCE_TYPE = 'AWS::EC2::Instance';
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
  liveDiscovery: {
    hydrator: 'aws-ec2-instance',
    resourceTypes: ['ec2:instance'],
  },
  evaluateLive: ({ ec2Instances }) => {
    const findings = ec2Instances
      .filter((instance) => getPreferredInstanceState(instance.instanceType) === 'non-preferred')
      .map((instance) => createFindingMatch(instance.instanceId, instance.region, instance.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
  evaluateStatic: ({ iacResources }) => {
    const findings = iacResources.flatMap((resource) => {
      if (resource.provider !== 'aws') {
        return [];
      }

      if (
        resource.type === TERRAFORM_INSTANCE_TYPE &&
        getPreferredInstanceState(resource.attributes.instance_type) === 'non-preferred'
      ) {
        return [
          createStaticFindingMatch(resource, `${resource.type}.${resource.name}`, [
            'instance_type',
            'Properties.InstanceType',
          ]),
        ];
      }

      const properties = isRecord(resource.attributes.Properties) ? resource.attributes.Properties : undefined;

      if (
        resource.type === CLOUDFORMATION_INSTANCE_TYPE &&
        properties &&
        getPreferredInstanceState(properties.InstanceType) === 'non-preferred'
      ) {
        return [createStaticFindingMatch(resource, resource.name, ['instance_type', 'Properties.InstanceType'])];
      }

      return [];
    });

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
