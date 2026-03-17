import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-ECS-3';
const RULE_SERVICE = 'ecs';
const RULE_MESSAGE = 'Active REPLICA ECS services should use an autoscaling policy.';

/** Flag active REPLICA ECS services that are missing autoscaling coverage. */
export const ecsServiceAutoscalingPolicyRule = createRule({
  id: RULE_ID,
  name: 'ECS Service Missing Autoscaling Policy',
  description:
    'Flag active REPLICA ECS services that do not have an Application Auto Scaling target and scaling policy.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ecs-services', 'aws-ecs-autoscaling'],
  evaluateLive: ({ resources }) => {
    const autoscalingByServiceArn = new Map(
      resources.get('aws-ecs-autoscaling').map((service) => [service.serviceArn, service] as const),
    );
    const findings = resources
      .get('aws-ecs-services')
      .filter((service) => service.status === 'ACTIVE' && service.schedulingStrategy === 'REPLICA')
      .filter((service) => {
        const autoscaling = autoscalingByServiceArn.get(service.serviceArn);

        // Skip services when autoscaling coverage could not be loaded for their region.
        return autoscaling ? !autoscaling.hasScalableTarget || !autoscaling.hasScalingPolicy : false;
      })
      .map((service) => createFindingMatch(service.serviceArn, service.region, service.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
