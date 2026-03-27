import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';
import {
  isAwsEc2GravitonFamily,
  shouldReviewAwsEc2InstanceTypeForGraviton,
} from '../ec2/preferred-instance-families.js';

const RULE_ID = 'CLDBRN-AWS-EKS-1';
const RULE_SERVICE = 'eks';
const RULE_MESSAGE = 'EKS node groups without a Graviton equivalent in use should be reviewed.';

const isArmEksAmiType = (amiType?: string): boolean => amiType?.toUpperCase().includes('ARM') ?? false;

const shouldReviewNodegroupForGraviton = (instanceTypes: string[], amiType?: string): boolean => {
  if (isArmEksAmiType(amiType) || instanceTypes.length === 0) {
    return false;
  }

  let sawReviewableFamily = false;

  for (const instanceType of instanceTypes) {
    if (isAwsEc2GravitonFamily(instanceType)) {
      return false;
    }

    if (shouldReviewAwsEc2InstanceTypeForGraviton(instanceType)) {
      sawReviewableFamily = true;
      continue;
    }

    // Skip custom or unclassified shapes so the advisory stays conservative.
    return false;
  }

  return sawReviewableFamily;
};

/** Flag EKS managed node groups that still use reviewable non-Graviton EC2 families. */
export const eksGravitonReviewRule = createRule({
  id: RULE_ID,
  name: 'EKS Node Group Without Graviton',
  description:
    'Flag EKS node groups that still use non-Graviton instance families when a clear Arm-based equivalent exists.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery', 'iac'],
  discoveryDependencies: ['aws-eks-nodegroups'],
  staticDependencies: ['aws-eks-nodegroups'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-eks-nodegroups')
      .filter((nodegroup) => shouldReviewNodegroupForGraviton(nodegroup.instanceTypes, nodegroup.amiType))
      .map((nodegroup) => createFindingMatch(nodegroup.nodegroupArn, nodegroup.region, nodegroup.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-eks-nodegroups')
      .filter((nodegroup) => shouldReviewNodegroupForGraviton(nodegroup.instanceTypes, nodegroup.amiType ?? undefined))
      .map((nodegroup) => createFindingMatch(nodegroup.resourceId, undefined, undefined, nodegroup.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
