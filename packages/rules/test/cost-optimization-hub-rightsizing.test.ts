import { describe, expect, it } from 'vitest';
import { awsCorePreset, awsRules, createAwsCostOptimizationHubFindingMatch, LiveResourceBag } from '../src/index.js';

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
    const unknownAmount = {
      confidence: 'unknown',
      period: 'month',
      reason: { code: 'missing_amount', message: 'The source did not provide a usable amount.' },
    };
    expect(finding?.findings).toEqual([
      {
        resourceId,
        accountId: '123456789012',
        region: 'eu-west-1',
        resourceType: namespace,
        actionType: 'Rightsize',
        impact: {
          source: 'aws-cost-optimization-hub',
          sourceId: 'rec-1',
          currentCost: unknownAmount,
          potentialSavings: unknownAmount,
        },
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

  it('reconciles an ECS service resource ID against the supplied service ARN', () => {
    const recommendation = {
      accountId: '123456789012',
      actionType: 'Rightsize' as const,
      currentConfiguration: { compute: { memorySizeInMB: 1024, vCpu: 1 } },
      recommendedConfiguration: { compute: { memorySizeInMB: 2048, vCpu: 1 } },
      currencyCode: 'USD',
      estimatedMonthlyCost: 30,
      estimatedMonthlySavings: 15,
      estimatedSavingsPercentage: 50,
      lastRefreshTimestamp: '2026-09-04T00:00:00.000Z',
      recommendationId: 'rec-1',
      recommendationSource: 'ComputeOptimizer' as const,
      region: 'eu-west-1',
      resourceType: 'EcsService' as const,
    };
    const consistent = createAwsCostOptimizationHubFindingMatch({
      ...recommendation,
      resourceId: 'api',
      resourceArn: 'arn:aws:ecs:eu-west-1:123456789012:service/blue/api',
    });
    expect(consistent.recommendation?.resourceKey).toContain('"ecs:service","blue/api"');
    expect(consistent.recommendation?.opportunityId).toBeDefined();
    const qualified = createAwsCostOptimizationHubFindingMatch({
      ...recommendation,
      resourceId: 'blue/api',
      resourceArn: 'arn:aws:ecs:eu-west-1:123456789012:service/api',
    });
    expect(qualified.resourceId).toBe('blue/api');
    expect(qualified.recommendation?.resourceKey).toContain('"ecs:service","blue/api"');
    expect(qualified.recommendation?.opportunityId).toBeDefined();
    for (const conflicting of [
      {
        ...recommendation,
        resourceId: 'blue/api',
        resourceArn: 'arn:aws:ecs:eu-west-1:123456789012:service/green/api',
      },
      { ...recommendation, resourceId: 'other', resourceArn: 'arn:aws:ecs:eu-west-1:123456789012:service/blue/api' },
      {
        ...recommendation,
        resourceId: 'blue/api',
        resourceArn: 'arn:aws:ecs:eu-west-1:123456789012:task-definition/api:1',
      },
      {
        ...recommendation,
        resourceId: 'blue/api',
        resourceArn: 'arn:aws:ecs:us-east-1:123456789012:service/blue/api',
      },
      {
        ...recommendation,
        resourceId: 'blue/api',
        resourceArn: 'arn:aws:ecs:eu-west-1:222222222222:service/blue/api',
      },
    ]) {
      const match = createAwsCostOptimizationHubFindingMatch(conflicting);
      expect(match.resourceId).toBe(conflicting.resourceId);
      expect(match.impact).toMatchObject({
        source: 'aws-cost-optimization-hub',
        sourceId: 'rec-1',
        currentCost: { amount: 30, confidence: 'estimated', currency: 'USD', period: 'month' },
        potentialSavings: { amount: 15, confidence: 'estimated', currency: 'USD', period: 'month' },
      });
      expect(match.recommendation).toMatchObject({
        source: 'aws-cost-optimization-hub',
        sourceDetail: 'ComputeOptimizer',
        sourceId: 'rec-1',
      });
      expect(match.recommendation?.resourceKey).toBeUndefined();
      expect(match.recommendation?.opportunityId).toBeUndefined();
    }
  });

  it('reconciles an unqualified Lambda function ID with a versioned ARN', () => {
    const recommendation = {
      accountId: '123456789012',
      actionType: 'Rightsize' as const,
      currentConfiguration: { compute: { memorySizeInMB: 1024 } },
      recommendedConfiguration: { compute: { memorySizeInMB: 2048 } },
      currencyCode: 'USD',
      estimatedMonthlyCost: 20,
      estimatedMonthlySavings: 10,
      estimatedSavingsPercentage: 50,
      lastRefreshTimestamp: '2026-09-04T00:00:00.000Z',
      recommendationId: 'rec-1',
      recommendationSource: 'ComputeOptimizer' as const,
      region: 'eu-west-1',
      resourceId: 'arn:aws:lambda:eu-west-1:123456789012:function:worker',
      resourceType: 'LambdaFunction' as const,
    };
    const consistent = createAwsCostOptimizationHubFindingMatch({
      ...recommendation,
      resourceArn: 'arn:aws:lambda:eu-west-1:123456789012:function:worker:3',
    });
    expect(consistent.recommendation?.opportunityId).toBeDefined();
    const conflicting = createAwsCostOptimizationHubFindingMatch({
      ...recommendation,
      resourceArn: 'arn:aws:lambda:eu-west-1:123456789012:function:worker-other:3',
    });
    expect(conflicting.recommendation).toMatchObject({
      source: 'aws-cost-optimization-hub',
      sourceDetail: 'ComputeOptimizer',
      sourceId: 'rec-1',
    });
    expect(conflicting.recommendation?.resourceKey).toBeUndefined();
    expect(conflicting.recommendation?.opportunityId).toBeUndefined();
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
