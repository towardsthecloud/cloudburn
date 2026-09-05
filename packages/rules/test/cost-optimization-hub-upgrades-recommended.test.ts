import { describe, expect, it } from 'vitest';
import {
  type AwsCostOptimizationHubUpgradeRecommendation,
  awsCorePreset,
  awsRules,
  LiveResourceBag,
} from '../src/index.js';

const ruleId = 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-5';
const recommendation: AwsCostOptimizationHubUpgradeRecommendation = {
  accountId: '123456789012',
  region: 'eu-west-1',
  actionType: 'Upgrade',
  resourceType: 'Ec2Instance',
  recommendationId: 'rec-1',
  resourceId: 'i-example',
  currencyCode: 'USD',
  estimatedMonthlyCost: 100,
  estimatedMonthlySavings: 10,
  estimatedSavingsPercentage: 10,
  implementationEffort: 'Medium',
  restartNeeded: true,
  rollbackPossible: true,
  recommendationSource: 'ComputeOptimizer',
  lastRefreshTimestamp: '2026-09-04T00:00:00Z',
  currentConfiguration: { instance: { type: 'm6i.large' } },
  recommendedConfiguration: { instance: { type: 'm7i.large' } },
};
const evaluate = (items: AwsCostOptimizationHubUpgradeRecommendation[]) =>
  awsRules
    .find((rule) => rule.id === ruleId)
    ?.evaluateLive?.({
      catalog: { indexType: 'LOCAL', resources: [], searchRegion: 'eu-west-1' },
      resources: new LiveResourceBag({ 'aws-cost-optimization-hub-upgrade-recommendations': items }),
    });

describe(ruleId, () => {
  it('exports discovery-only opt-in metadata and its dataset dependency', () => {
    expect(awsRules.find((rule) => rule.id === ruleId)).toMatchObject({
      id: ruleId,
      service: 'costoptimizationhub',
      supports: ['discovery'],
      discoveryDependencies: ['aws-cost-optimization-hub-upgrade-recommendations'],
    });
    expect(awsCorePreset.ruleIds).not.toContain(ruleId);
  });
  it('reports an upgrade once per recommendation ID and no finding for empty evidence', () => {
    expect(evaluate([recommendation, recommendation])).toMatchObject({
      ruleId,
      findings: [
        { accountId: '123456789012', region: 'eu-west-1', resourceId: 'i-example', resourceType: 'ec2:instance' },
      ],
    });
    expect(evaluate([])).toBeNull();
  });
});
