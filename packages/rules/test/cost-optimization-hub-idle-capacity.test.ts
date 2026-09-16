import { describe, expect, it } from 'vitest';
import { awsCorePreset, awsRules, createAwsCostOptimizationHubFindingMatch, LiveResourceBag } from '../src/index.js';

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
    expect(
      rule?.evaluateLive?.({
        catalog: { indexType: 'LOCAL', resources: [], searchRegion: 'eu-west-1' },
        resources: new LiveResourceBag({
          'aws-cost-optimization-hub-idle-recommendations': [
            {
              ...recommendation,
              actionType: 'ScaleIn',
              currentResourceType: 'Ec2AutoScalingGroup',
              resourceId:
                'arn:aws:autoscaling:eu-west-1:123456789012:autoScalingGroup:12345678-1234-1234-1234-123456789012:autoScalingGroupName/workers',
              recommendedConfiguration: { instance: { type: 'm7i.large' } },
            },
          ],
        }),
      }),
    ).toMatchObject({
      findings: [{ resourceId: 'workers', resourceType: 'autoscaling:autoScalingGroup', actionType: 'ScaleIn' }],
    });
  });

  it('keeps same-name ECS services in different clusters as distinct opportunities', () => {
    const rule = awsRules.find(({ id }) => id === 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-3');
    const recommendation = (cluster: string, recommendationId: string) => ({
      accountId: '123456789012',
      actionType: 'Delete' as const,
      currentResourceType: 'EcsService' as const,
      currentConfiguration: { compute: { vCpu: 1 } },
      recommendedConfiguration: null,
      currencyCode: 'USD',
      estimatedMonthlyCost: 30,
      estimatedMonthlySavings: 30,
      estimatedSavingsPercentage: 100,
      implementationEffort: 'Low',
      lastRefreshTimestamp: '2026-09-04T00:00:00.000Z',
      recommendationId,
      recommendationSource: 'ComputeOptimizer' as const,
      region: 'eu-west-1',
      resourceArn: `arn:aws:ecs:eu-west-1:123456789012:service/${cluster}/api`,
      resourceId: 'api',
      restartNeeded: false,
      rollbackPossible: true,
    });
    const evaluate = (items: ReturnType<typeof recommendation>[]) =>
      rule?.evaluateLive?.({
        catalog: { indexType: 'LOCAL', resources: [], searchRegion: 'eu-west-1' },
        resources: new LiveResourceBag({ 'aws-cost-optimization-hub-idle-recommendations': items }),
      });
    const forward = evaluate([recommendation('blue', 'rec-blue'), recommendation('green', 'rec-green')]);
    const reversed = evaluate([recommendation('green', 'rec-green'), recommendation('blue', 'rec-blue')]);
    expect(forward?.findings.map((finding) => finding.resourceId)).toEqual(['blue/api', 'green/api']);
    expect(reversed).toEqual(forward);
    const [blue, green] = forward?.findings ?? [];
    expect(blue?.recommendation?.opportunityId).toBeDefined();
    expect(blue?.recommendation?.opportunityId).not.toBe(green?.recommendation?.opportunityId);
  });

  it('keeps provenance but omits identity when a raw ARN scope conflicts with the finding scope', () => {
    const recommendation = {
      accountId: '123456789012',
      actionType: 'Delete' as const,
      currentResourceType: 'EbsVolume' as const,
      currentConfiguration: { storage: { type: 'gp2', sizeInGb: 8 } },
      recommendedConfiguration: null,
      currencyCode: 'USD',
      estimatedMonthlyCost: 10,
      estimatedMonthlySavings: 10,
      estimatedSavingsPercentage: 100,
      implementationEffort: 'Low',
      lastRefreshTimestamp: '2026-09-04T00:00:00.000Z',
      recommendationId: 'rec-1',
      recommendationSource: 'CostExplorer' as const,
      region: 'eu-west-1',
      resourceId: 'arn:aws:ec2:eu-west-1:123456789012:volume/vol-1',
      restartNeeded: false,
      rollbackPossible: true,
    };
    const consistent = createAwsCostOptimizationHubFindingMatch(recommendation);
    expect(consistent.recommendation?.resourceKey).toContain('"ec2:volume","vol-1"');
    expect(consistent.recommendation?.opportunityId).toContain('"Delete"');

    for (const conflicting of [
      { ...recommendation, resourceId: 'arn:aws:ec2:us-east-1:123456789012:volume/vol-1' },
      { ...recommendation, resourceId: 'arn:aws:ec2:eu-west-1:999999999999:volume/vol-1' },
      {
        ...recommendation,
        resourceId: 'vol-1',
        resourceArn: 'arn:aws:ec2:us-east-1:123456789012:volume/vol-1',
      },
    ]) {
      const match = createAwsCostOptimizationHubFindingMatch(conflicting);
      expect(match.recommendation).toMatchObject({
        source: 'aws-cost-optimization-hub',
        sourceDetail: 'CostExplorer',
        sourceId: 'rec-1',
      });
      expect(match.recommendation?.resourceKey).toBeUndefined();
      expect(match.recommendation?.opportunityId).toBeUndefined();
    }
  });
});
