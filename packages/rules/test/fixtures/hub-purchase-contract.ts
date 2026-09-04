import type {
  AwsCostOptimizationHubRecommendation,
  AwsCostOptimizationHubRightsizingRecommendation,
} from '../../src/index.js';

declare const purchase: AwsCostOptimizationHubRecommendation;
const action: 'PurchaseReservedInstances' | 'PurchaseSavingsPlans' = purchase.actionType;
void action;

declare const rightsizing: AwsCostOptimizationHubRightsizingRecommendation;
if (rightsizing.resourceType === 'EcsService') {
  const cpu: number = rightsizing.recommendedConfiguration.compute.vCpu;
  void cpu;
  // @ts-expect-error ECS configurations do not expose EC2 instance details.
  rightsizing.currentConfiguration.instance;
}
