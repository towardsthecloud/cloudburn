import { describe, expect, it } from 'vitest';
import { awsCorePreset, awsRules, LiveResourceBag } from '../src/index.js';

describe('CLDBRN-AWS-COSTOPTIMIZATIONHUB-4', () => {
  it.each([
    ['Ec2Instance', 'ec2:instance'],
    ['Ec2AutoScalingGroup', 'autoscaling:autoScalingGroup'],
    ['EbsVolume', 'ec2:volume'],
    ['LambdaFunction', 'lambda:function'],
    ['EcsService', 'ecs:service'],
    ['RdsDbInstance', 'rds:db'],
    ['RdsDbInstanceStorage', 'rds:db-storage'],
    ['AuroraDbClusterStorage', 'rds:cluster-storage'],
  ])('maps %s identity to %s and deduplicates recommendation IDs', (resourceType, namespace) => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-4');
    // The evaluator consumes identity and action; detail validation belongs to the SDK loader.
    const recommendation = {
      resourceType,
      actionType: 'Rightsize',
      resourceId: 'resource-example',
      recommendationId: 'rec-1',
      accountId: '123456789012',
      region: 'eu-west-1',
    };
    const finding = rule?.evaluateLive?.({
      catalog: { resources: [], indexType: 'LOCAL', searchRegion: 'eu-west-1' },
      resources: new LiveResourceBag({
        'aws-cost-optimization-hub-rightsizing-recommendations': [recommendation, recommendation] as never,
      }),
    });
    expect(finding?.findings).toEqual([
      { resourceId: 'resource-example', accountId: '123456789012', region: 'eu-west-1', resourceType: namespace },
    ]);
  });
  it.each([
    { recommendations: [] },
    { recommendations: [{ actionType: 'Upgrade' }] },
    { recommendations: [{ actionType: 'MigrateToGraviton' }] },
  ])('returns no finding without a rightsizing action', ({ recommendations }) => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-4');
    expect(
      rule?.evaluateLive?.({
        catalog: { resources: [], indexType: 'LOCAL', searchRegion: 'eu-west-1' },
        resources: new LiveResourceBag({
          'aws-cost-optimization-hub-rightsizing-recommendations': recommendations as never,
        }),
      }),
    ).toBeNull();
  });
  it('exports an opt-in discovery rule and reports an EC2 rightsizing opportunity', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-4');
    expect(rule).toBeDefined();
    expect(awsCorePreset.ruleIds).not.toContain(rule?.id);
    expect(rule).toMatchObject({
      supports: ['discovery'],
      discoveryDependencies: ['aws-cost-optimization-hub-rightsizing-recommendations'],
    });
    expect(
      rule?.evaluateLive?.({
        catalog: { resources: [], searchRegion: 'eu-west-1', indexType: 'LOCAL' },
        resources: new LiveResourceBag({
          'aws-cost-optimization-hub-rightsizing-recommendations': [
            {
              accountId: '123456789012',
              region: 'eu-west-1',
              actionType: 'Rightsize',
              resourceType: 'Ec2Instance',
              resourceId: 'i-example',
              recommendationId: 'rec-1',
              currencyCode: 'USD',
              estimatedMonthlyCost: 100,
              estimatedMonthlySavings: 50,
              estimatedSavingsPercentage: 50,
              recommendationSource: 'ComputeOptimizer',
              lastRefreshTimestamp: '2026-09-04T00:00:00.000Z',
              currentConfiguration: { instance: { type: 'm7i.xlarge' } },
              recommendedConfiguration: { instance: { type: 'm7i.large' } },
            },
          ],
        }),
      }),
    ).toMatchObject({
      ruleId: 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-4',
      findings: [
        { accountId: '123456789012', region: 'eu-west-1', resourceId: 'i-example', resourceType: 'ec2:instance' },
      ],
    });
  });
});
