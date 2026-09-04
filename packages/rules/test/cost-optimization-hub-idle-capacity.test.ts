import { describe, expect, it } from 'vitest';
import { awsCorePreset, awsRules, LiveResourceBag } from '../src/index.js';

describe('CLDBRN-AWS-COSTOPTIMIZATIONHUB-3', () => {
  it('is exported, opt-in, and reports an idle recommendation once', () => {
    const rule = awsRules.find(({ id }) => id === 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-3');
    expect(rule).toBeDefined();
    expect(awsCorePreset.ruleIds).not.toContain(rule?.id);
    const recommendation = {
      accountId: '123456789012',
      actionType: 'Stop' as const,
      currentResourceType: 'Ec2Instance' as const,
      currentConfiguration: { instance: { type: 'm7i.large' } },
      recommendedConfiguration: null,
      currencyCode: 'USD',
      estimatedMonthlyCost: 50,
      estimatedMonthlySavings: 50,
      estimatedSavingsPercentage: 100,
      implementationEffort: 'Low',
      lastRefreshTimestamp: '2026-09-04T00:00:00.000Z',
      recommendationId: 'rec-1',
      recommendationSource: 'ComputeOptimizer' as const,
      region: 'eu-west-1',
      resourceId: 'i-test',
      restartNeeded: false,
      rollbackPossible: true,
    };
    const evaluate = (items: (typeof recommendation)[]) =>
      rule?.evaluateLive?.({
        catalog: { indexType: 'LOCAL', resources: [], searchRegion: 'eu-west-1' },
        resources: new LiveResourceBag({ 'aws-cost-optimization-hub-idle-recommendations': items }),
      });
    expect(evaluate([recommendation, recommendation])).toMatchObject({
      ruleId: rule?.id,
      findings: [
        {
          accountId: '123456789012',
          region: 'eu-west-1',
          resourceId: 'i-test',
          resourceType: 'ec2:instance',
          actionType: 'Stop',
        },
      ],
    });
    expect(evaluate([])).toBeNull();
  });
});
