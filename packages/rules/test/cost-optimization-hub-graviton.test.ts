import { expect, it } from 'vitest';
import { awsCorePreset, awsRules, createAwsCostOptimizationHubFindingMatch, LiveResourceBag } from '../src/index.js';

it.each([
  ['Ec2Instance', 'ec2:instance', 'inferred_compatible'],
  ['Ec2Instance', 'ec2:instance', 'unclassified'],
  ['Ec2AutoScalingGroup', 'autoscaling:autoScalingGroup', 'inferred_compatible'],
  ['RdsDbInstance', 'rds:db', 'not_applicable'],
] as const)('reports %s (%s) with %s evidence once', (currentResourceType, resourceType, workloadCompatibility) => {
  const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-6');
  expect(rule).toMatchObject({
    supports: ['discovery'],
    discoveryDependencies: ['aws-cost-optimization-hub-graviton-recommendations'],
  });
  expect(awsCorePreset.ruleIds).not.toContain(rule?.id);
  const recommendation = {
    accountId: '123456789012',
    actionType: 'MigrateToGraviton' as const,
    currentResourceType,
    currentConfiguration: { instanceType: 'm6i.large' },
    recommendedConfiguration: { instanceType: 'm7g.large' },
    workloadCompatibility,
    currencyCode: 'USD',
    estimatedMonthlyCost: 100,
    estimatedMonthlySavings: 20,
    estimatedSavingsPercentage: 20,
    implementationEffort: 'VeryHigh',
    lastRefreshTimestamp: '2026-09-04T00:00:00.000Z',
    recommendationId: 'rec-1',
    recommendationSource: 'ComputeOptimizer' as const,
    region: 'eu-west-1',
    resourceId: 'i-example',
    resourceArn: 'arn:aws:ec2:eu-west-1:123456789012:instance/i-example',
    restartNeeded: true,
    rollbackPossible: true,
  };
  expect(
    rule?.evaluateLive?.({
      catalog: { indexType: 'LOCAL', resources: [], searchRegion: 'eu-west-1' },
      resources: new LiveResourceBag({
        'aws-cost-optimization-hub-graviton-recommendations': [recommendation, recommendation],
      }),
    }),
  ).toMatchObject({
    ruleId: rule?.id,
    findings: [{ accountId: '123456789012', region: 'eu-west-1', resourceId: 'i-example', resourceType }],
  });
});

it.each([
  ['region', { resourceArn: 'arn:aws:ec2:us-east-1:123456789012:instance/i-example' }],
  ['account', { resourceArn: 'arn:aws:ec2:eu-west-1:999999999999:instance/i-example' }],
] as const)('keeps provenance but omits identity when the resource ARN %s conflicts', (_scope, overrides) => {
  const match = createAwsCostOptimizationHubFindingMatch({
    accountId: '123456789012',
    actionType: 'MigrateToGraviton',
    currentResourceType: 'Ec2Instance',
    currentConfiguration: { instanceType: 'm6i.large' },
    recommendedConfiguration: { instanceType: 'm7g.large' },
    workloadCompatibility: 'inferred_compatible',
    currencyCode: 'USD',
    estimatedMonthlyCost: 100,
    estimatedMonthlySavings: 20,
    estimatedSavingsPercentage: 20,
    implementationEffort: 'VeryHigh',
    lastRefreshTimestamp: '2026-09-04T00:00:00.000Z',
    recommendationId: 'rec-1',
    recommendationSource: 'ComputeOptimizer',
    region: 'eu-west-1',
    resourceId: 'i-example',
    ...overrides,
    restartNeeded: true,
    rollbackPossible: true,
  });
  expect(match.recommendation).toMatchObject({
    source: 'aws-cost-optimization-hub',
    sourceDetail: 'ComputeOptimizer',
    sourceId: 'rec-1',
  });
  expect(match.recommendation?.resourceKey).toBeUndefined();
  expect(match.recommendation?.opportunityId).toBeUndefined();
});
