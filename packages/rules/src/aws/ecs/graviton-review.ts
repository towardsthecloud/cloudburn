import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';
import { shouldReviewAwsEc2InstanceForGraviton } from '../ec2/preferred-instance-families.js';

const RULE_ID = 'CLDBRN-AWS-ECS-1';
const RULE_SERVICE = 'ecs';
const RULE_MESSAGE = 'ECS container instances without a Graviton equivalent in use should be reviewed.';

/** Flag ECS container instances backed by non-Graviton EC2 families with a clear Arm equivalent. */
export const ecsGravitonReviewRule = createRule({
  id: RULE_ID,
  name: 'ECS Container Instance Without Graviton',
  description:
    'Flag ECS container instances backed by EC2 instance types that still run on non-Graviton families when a clear Arm-based equivalent exists.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ecs-container-instances'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ecs-container-instances')
      .filter(
        (instance) =>
          Boolean(instance.instanceType) &&
          shouldReviewAwsEc2InstanceForGraviton(instance.instanceType ?? '', instance.architecture),
      )
      .map((instance) => createFindingMatch(instance.containerInstanceArn, instance.region, instance.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
