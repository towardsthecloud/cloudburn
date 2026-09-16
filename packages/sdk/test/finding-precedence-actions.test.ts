import type { CloudProvider, FindingMatch } from '@cloudburn/rules';
import { createAwsCostOptimizationHubFindingMatch, createRecommendationMatch } from '@cloudburn/rules';
import { describe, expect, it } from 'vitest';
import { applyFindingPrecedence, type EvaluatedRuleFinding } from '../src/engine/finding-precedence.js';

const finding = (ruleId: string, findings: FindingMatch[]) => ({
  ruleId,
  service: 'test',
  severity: 'medium' as const,
  source: 'discovery' as const,
  message: 'test',
  findings,
});

const match = (overrides: Partial<FindingMatch>): FindingMatch => {
  const { recommendation, ...rest } = overrides;
  const base: FindingMatch = {
    resourceId: 'vol-1',
    resourceType: 'ec2:volume',
    accountId: '111111111111',
    region: 'eu-west-1',
    actionType: 'Delete',
    ...rest,
  };
  return recommendation ? createRecommendationMatch('aws', base, recommendation) : base;
};

const rule = (ruleId: string, findings: FindingMatch[] | null, supersedesRuleIds?: string[]): EvaluatedRuleFinding => ({
  ruleId,
  provider: 'aws',
  finding: findings ? finding(ruleId, findings) : null,
  supersedesRuleIds,
});

describe('action-specific precedence', () => {
  it.each(['Stop', undefined])('keeps a different or unknown native action (%s)', (actionType) => {
    const match = {
      resourceId: 'resource',
      resourceType: 'test:resource',
      accountId: '123456789012',
      region: 'eu-west-1',
    };
    const finding = {
      ruleId: 'hub',
      service: 'test',
      severity: 'medium' as const,
      source: 'discovery' as const,
      message: 'test',
      findings: [{ ...match, actionType: 'Delete' }],
    };
    const rules: EvaluatedRuleFinding[] = [
      { ruleId: 'hub', provider: 'aws', finding },
      {
        ruleId: 'native',
        provider: 'aws',
        supersedesRuleIds: ['hub'],
        finding: { ...finding, ruleId: 'native', findings: [{ ...match, actionType }] },
      },
    ];
    expect(applyFindingPrecedence(rules)[0]?.finding).toEqual(finding);
  });
});

describe('deterministic recommendation precedence', () => {
  it('produces identical output for reversed rule and match orders', () => {
    const hub = match({
      recommendation: { source: 'aws-cost-optimization-hub', sourceId: 'rec-1' },
    });
    const native = match({ recommendation: { source: 'cloudburn' } });
    const forward = applyFindingPrecedence([rule('hub', [hub]), rule('native', [native], ['hub'])]);
    const reversed = applyFindingPrecedence([rule('native', [native], ['hub']), rule('hub', [hub])]);
    expect(reversed).toEqual(forward);
  });

  it('prefers the native EBS delete finding over the Hub finding for the same opportunity', () => {
    const hubMatch = match({ recommendation: { source: 'aws-cost-optimization-hub', sourceId: 'rec-1' } });
    const nativeMatch = match({ recommendation: { source: 'cloudburn' } });
    const result = applyFindingPrecedence([
      rule('CLDBRN-AWS-COSTOPTIMIZATIONHUB-3', [hubMatch]),
      rule('CLDBRN-AWS-EBS-2', [nativeMatch], ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-3']),
    ]);
    expect(result).toEqual([
      expect.objectContaining({ ruleId: 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-3', finding: null }),
      expect.objectContaining({
        ruleId: 'CLDBRN-AWS-EBS-2',
        finding: expect.objectContaining({ findings: [nativeMatch] }),
      }),
    ]);
  });

  it('prefers Hub over native for EC2 and RDS Graviton opportunities, including ARN/local equivalence', () => {
    const hubEc2 = match({
      resourceId: 'arn:aws:ec2:eu-west-1:111111111111:instance/i-1',
      resourceType: 'ec2:instance',
      actionType: 'MigrateToGraviton',
      recommendation: { source: 'aws-cost-optimization-hub', sourceId: 'rec-1' },
    });
    const nativeEc2 = match({
      resourceId: 'i-1',
      resourceType: 'ec2:instance',
      actionType: 'MigrateToGraviton',
      recommendation: { source: 'cloudburn' },
    });
    const hubRds = match({
      resourceId: 'db-1',
      resourceType: 'rds:db',
      actionType: 'MigrateToGraviton',
      recommendation: { source: 'aws-cost-optimization-hub', sourceId: 'rec-2' },
    });
    const nativeRds = match({
      resourceId: 'db-1',
      resourceType: 'rds:db',
      actionType: 'MigrateToGraviton',
      recommendation: { source: 'cloudburn' },
    });
    const result = applyFindingPrecedence([
      rule('CLDBRN-AWS-EC2-6', [nativeEc2]),
      rule('CLDBRN-AWS-RDS-4', [nativeRds]),
      rule('CLDBRN-AWS-COSTOPTIMIZATIONHUB-6', [hubEc2, hubRds], ['CLDBRN-AWS-EC2-6', 'CLDBRN-AWS-RDS-4']),
    ]);
    expect(result).toEqual([
      expect.objectContaining({
        ruleId: 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-6',
        finding: expect.objectContaining({ findings: expect.arrayContaining([hubEc2, hubRds]) }),
      }),
      expect.objectContaining({ ruleId: 'CLDBRN-AWS-EC2-6', finding: null }),
      expect.objectContaining({ ruleId: 'CLDBRN-AWS-RDS-4', finding: null }),
    ]);
  });

  it('keeps separate opportunities for different actions on the same resource', () => {
    const deleteMatch = match({ actionType: 'Delete' });
    const upgradeMatch = match({ actionType: 'Upgrade' });
    const result = applyFindingPrecedence([
      rule('hub-delete', [deleteMatch]),
      rule('hub-upgrade', [upgradeMatch], ['hub-delete']),
    ]);
    expect(result[0]?.finding?.findings).toEqual([deleteMatch]);
    expect(result[1]?.finding?.findings).toEqual([upgradeMatch]);
  });

  it.each([
    ['region', 'aws' as CloudProvider, { region: 'us-east-1' }],
    ['account', 'aws' as CloudProvider, { accountId: '222222222222' }],
    ['provider', 'azure' as CloudProvider, {}],
    ['resource type', 'aws' as CloudProvider, { resourceType: 'ec2:instance' }],
  ])('does not collide across %s', (_label, provider, scopeOverride) => {
    const awsMatch = match({});
    const result = applyFindingPrecedence([
      rule('hub', [awsMatch]),
      { ...rule('native', [match(scopeOverride)], ['hub']), provider },
    ]);
    expect(result[0]?.finding?.findings).toHaveLength(1);
    expect(result[1]?.finding?.findings).toHaveLength(1);
  });

  it('deduplicates the same opportunity with missing source IDs but keeps different resources', () => {
    const first = match({ recommendation: { source: 'aws-cost-optimization-hub' } });
    const duplicate = match({
      resourceId: 'arn:aws:ec2:eu-west-1:111111111111:volume/vol-1',
      recommendation: { source: 'aws-cost-optimization-hub' },
    });
    const other = match({ resourceId: 'vol-2', recommendation: { source: 'aws-cost-optimization-hub' } });
    const result = applyFindingPrecedence([rule('hub', [first, duplicate, other])]);
    expect(result[0]?.finding?.findings).toHaveLength(2);
    expect(result[0]?.finding?.findings).toEqual(expect.arrayContaining([duplicate, other]));
  });

  it('keeps the freshest match when one rule reports competing source recommendation IDs', () => {
    const older = match({
      recommendation: {
        source: 'aws-cost-optimization-hub',
        sourceId: 'rec-a',
        refreshedAt: '2026-04-01T00:00:00.000Z',
      },
    });
    const newer = match({
      recommendation: {
        source: 'aws-cost-optimization-hub',
        sourceId: 'rec-b',
        refreshedAt: '2026-04-20T00:00:00.000Z',
      },
    });
    const result = applyFindingPrecedence([rule('hub', [older, newer])]);
    expect(result[0]?.finding?.findings).toEqual([newer]);
    const reversedResult = applyFindingPrecedence([rule('hub', [newer, older])]);
    expect(reversedResult[0]?.finding?.findings).toEqual([newer]);
  });

  it('breaks same-freshness ties deterministically', () => {
    const a = match({ recommendation: { source: 'aws-cost-optimization-hub', sourceId: 'rec-a' } });
    const b = match({ recommendation: { source: 'aws-cost-optimization-hub', sourceId: 'rec-b' } });
    const forward = applyFindingPrecedence([rule('hub', [a, b])]);
    const reversed = applyFindingPrecedence([rule('hub', [b, a])]);
    expect(forward).toEqual(reversed);
    expect(forward[0]?.finding?.findings).toHaveLength(1);
  });

  it('does not mutate input findings or metadata', () => {
    const hubMatch = match({ recommendation: { source: 'aws-cost-optimization-hub' } });
    const nativeMatch = match({ recommendation: { source: 'cloudburn' } });
    const rules = [rule('hub', [hubMatch]), rule('native', [nativeMatch], ['hub'])];
    const snapshot = JSON.parse(JSON.stringify(rules));
    applyFindingPrecedence(rules);
    expect(rules).toEqual(snapshot);
  });

  it('survives precedence cycles without removing every candidate', () => {
    const shared = match({});
    const result = applyFindingPrecedence([
      rule('rule-a', [shared], ['rule-b']),
      rule('rule-b', [match({})], ['rule-a']),
    ]);
    const retained = result.filter((entry) => entry.finding !== null);
    expect(retained).toHaveLength(1);
    expect(retained[0]?.ruleId).toBe('rule-a');
  });

  it('resolves transitive supersession chains', () => {
    const shared = match({});
    const result = applyFindingPrecedence([
      rule('rule-c', [shared]),
      rule('rule-a', [match({})], ['rule-b']),
      rule('rule-b', [match({})], ['rule-c']),
    ]);
    expect(result).toEqual([
      expect.objectContaining({ ruleId: 'rule-a', finding: expect.objectContaining({}) }),
      expect.objectContaining({ ruleId: 'rule-b', finding: null }),
      expect.objectContaining({ ruleId: 'rule-c', finding: null }),
    ]);
  });

  it('preserves findings without a complete identity scope', () => {
    const unscoped = { resourceId: 'vol-1' };
    const scoped = match({});
    const result = applyFindingPrecedence([rule('hub', [unscoped, scoped]), rule('native', [match({})], ['hub'])]);
    expect(result[0]?.finding?.findings).toEqual([unscoped]);
    expect(result[1]?.finding?.findings).toEqual([match({})]);
  });

  it('treats recommendation provenance without identity keys as deliberately unidentifiable', () => {
    const hubMatch = createAwsCostOptimizationHubFindingMatch({
      accountId: '111111111111',
      actionType: 'PurchaseReservedInstances',
      configuration: {
        accountScope: 'Payer',
        paymentOption: 'NoUpfront',
        reservedInstancesRegion: 'eu-west-1',
        term: 'OneYear',
        upfrontCost: 0,
      },
      currencyCode: 'USD',
      estimatedMonthlyCost: 200,
      estimatedMonthlySavings: 50,
      estimatedSavingsPercentage: 25,
      lastRefreshTimestamp: '2026-09-04T00:00:00.000Z',
      recommendationId: 'orders',
      recommendationSource: 'CostExplorer',
      region: 'eu-west-1',
      reservationType: 'RdsReservedInstances',
    });
    expect(hubMatch.resourceId).toBe('orders');
    expect(hubMatch.recommendation?.opportunityId).toBeUndefined();
    const nativeMatch = match({
      resourceId: 'orders',
      resourceType: 'rds:db',
      actionType: 'PurchaseReservedInstances',
      recommendation: { source: 'cloudburn' },
    });
    const result = applyFindingPrecedence([
      rule('CLDBRN-AWS-COSTOPTIMIZATIONHUB-2', [hubMatch]),
      rule('CLDBRN-AWS-RDS-3', [nativeMatch], ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-2']),
    ]);
    expect(result[0]?.finding?.findings).toEqual([hubMatch]);
    expect(result[1]?.finding?.findings).toEqual([nativeMatch]);
  });

  it('never suppresses a native finding when the Hub ARN scope conflicts with the finding scope', () => {
    const hubMatch = createAwsCostOptimizationHubFindingMatch({
      accountId: '111111111111',
      actionType: 'Delete',
      currentResourceType: 'EbsVolume',
      currentConfiguration: { storage: { type: 'gp2', sizeInGb: 8 } },
      recommendedConfiguration: null,
      currencyCode: 'USD',
      estimatedMonthlyCost: 10,
      estimatedMonthlySavings: 10,
      estimatedSavingsPercentage: 100,
      implementationEffort: 'Low',
      lastRefreshTimestamp: '2026-09-04T00:00:00.000Z',
      recommendationId: 'rec-1',
      recommendationSource: 'CostExplorer',
      region: 'eu-west-1',
      resourceId: 'vol-1',
      resourceArn: 'arn:aws:ec2:us-east-1:111111111111:volume/vol-1',
      restartNeeded: false,
      rollbackPossible: true,
    });
    expect(hubMatch.recommendation?.opportunityId).toBeUndefined();
    const nativeMatch = match({ recommendation: { source: 'cloudburn' } });
    const result = applyFindingPrecedence([
      rule('CLDBRN-AWS-COSTOPTIMIZATIONHUB-3', [hubMatch]),
      rule('CLDBRN-AWS-EBS-2', [nativeMatch], ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-3']),
    ]);
    expect(result[0]?.finding?.findings).toEqual([hubMatch]);
    expect(result[1]?.finding?.findings).toEqual([nativeMatch]);
  });

  it('drops a repeated match object once within one rule output', () => {
    const shared = match({});
    const result = applyFindingPrecedence([rule('hub', [shared, shared])]);
    expect(result[0]?.finding?.findings).toEqual([shared]);
  });

  it('drops only the losing occurrence when two rules share one match object', () => {
    const shared = match({});
    const result = applyFindingPrecedence([rule('rule-a', [shared], ['rule-b']), rule('rule-b', [shared])]);
    expect(result).toEqual([
      expect.objectContaining({
        ruleId: 'rule-a',
        finding: expect.objectContaining({ findings: [shared] }),
      }),
      expect.objectContaining({ ruleId: 'rule-b', finding: null }),
    ]);
  });

  it('keeps precedence edges provider-local for identical rule IDs in different providers', () => {
    const results = (): EvaluatedRuleFinding[] => [
      { ruleId: 'hub', provider: 'azure', finding: finding('hub', [match({})]) },
      { ruleId: 'native', provider: 'azure', finding: finding('native', [match({})]) },
      rule('hub', [match({})], ['native']),
      rule('native', [match({})]),
    ];
    const forward = applyFindingPrecedence(results());
    const reversed = applyFindingPrecedence([...results()].reverse());
    expect(forward).toEqual(reversed);
    expect(forward.find((entry) => entry.provider === 'aws' && entry.ruleId === 'native')?.finding).toBeNull();
    expect(
      forward.find((entry) => entry.provider === 'azure' && entry.ruleId === 'native')?.finding?.findings,
    ).toHaveLength(1);
  });
});
