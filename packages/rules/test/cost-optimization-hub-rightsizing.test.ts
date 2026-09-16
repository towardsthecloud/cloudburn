import { describe, expect, it } from 'vitest';
import { awsCorePreset, awsRules, LiveResourceBag } from '../src/index.js';

describe('CLDBRN-AWS-COSTOPTIMIZATIONHUB-4', () => {
  it.each([
    ['Ec2Instance', 'ec2:instance', 'resource-example'],
    ['Ec2AutoScalingGroup', 'autoscaling:autoScalingGroup', 'resource-example'],
    ['EbsVolume', 'ec2:volume', 'resource-example'],
    ['LambdaFunction', 'lambda:function', 'resource-example'],
    ['EcsService', 'ecs:service', 'cluster/resource-example'],
    ['RdsDbInstance', 'rds:db', 'resource-example'],
    ['RdsDbInstanceStorage', 'rds:db-storage', 'resource-example'],
    ['AuroraDbClusterStorage', 'rds:cluster-storage', 'resource-example'],
  ])('maps %s identity to %s and deduplicates recommendation IDs', (resourceType, namespace, resourceId) => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-4');
    // The evaluator consumes identity and action; detail validation belongs to the SDK loader.
    const recommendation = {
      resourceType,
      actionType: 'Rightsize',
      resourceId,
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
      {
        resourceId,
        accountId: '123456789012',
        region: 'eu-west-1',
        resourceType: namespace,
        actionType: 'Rightsize',
        recommendation: {
          source: 'aws-cost-optimization-hub',
          sourceId: 'rec-1',
          resourceKey: `["resource",1,"aws","123456789012","eu-west-1","${namespace}","${resourceId}"]`,
          opportunityId: `["opportunity",1,"aws","123456789012","eu-west-1","${namespace}","${resourceId}","Rightsize"]`,
        },
      },
    ]);
  });

  it('keeps same-name ECS services in different clusters as distinct opportunities', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-4');
    const recommendation = (cluster: string, recommendationId: string) => ({
      accountId: '123456789012',
      actionType: 'Rightsize',
      recommendationId,
      region: 'eu-west-1',
      resourceArn: `arn:aws:ecs:eu-west-1:123456789012:service/${cluster}/api`,
      resourceId: 'api',
      resourceType: 'EcsService',
    });
    const evaluate = (items: unknown[]) =>
      rule?.evaluateLive?.({
        catalog: { resources: [], indexType: 'LOCAL', searchRegion: 'eu-west-1' },
        resources: new LiveResourceBag({
          'aws-cost-optimization-hub-rightsizing-recommendations': items as never,
        }),
      });
    const forward = evaluate([recommendation('blue', 'rec-blue'), recommendation('green', 'rec-green')]);
    const reversed = evaluate([recommendation('green', 'rec-green'), recommendation('blue', 'rec-blue')]);
    expect(forward?.findings.map((finding) => finding.resourceId)).toEqual(['blue/api', 'green/api']);
    expect(reversed).toEqual(forward);
    const [blue, green] = forward?.findings ?? [];
    expect(blue?.recommendation?.opportunityId).toBeDefined();
    expect(blue?.recommendation?.opportunityId).not.toBe(green?.recommendation?.opportunityId);
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
