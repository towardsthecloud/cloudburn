import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';
import { shouldReviewAwsEc2InstanceForGraviton } from './preferred-instance-families.js';

const RULE_ID = 'CLDBRN-AWS-EC2-9';
const RULE_SERVICE = 'ec2';
const RULE_MESSAGE = 'EC2 instances without a Graviton equivalent in use should be reviewed.';

/** Flag EC2 instances that still run on non-Graviton families with a clear Arm equivalent. */
export const ec2GravitonReviewRule = createRule({
  id: RULE_ID,
  name: 'EC2 Instance Without Graviton',
  description: 'Flag EC2 instances that still run on non-Graviton families when a clear Arm-based equivalent exists.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ec2-instances'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ec2-instances')
      .filter((instance) => shouldReviewAwsEc2InstanceForGraviton(instance.instanceType, instance.architecture))
      .map((instance) => createFindingMatch(instance.instanceId, instance.region, instance.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
