import { ecsGravitonReviewRule } from './graviton-review.js';
import { ecsLowCpuUtilizationRule } from './low-cpu-utilization.js';
import { ecsServiceAutoscalingPolicyRule } from './service-autoscaling-policy.js';

/** Aggregate AWS ECS rule definitions. */
export const ecsRules = [ecsGravitonReviewRule, ecsLowCpuUtilizationRule, ecsServiceAutoscalingPolicyRule];
