import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  AwsCapabilityOutcome,
  AwsCapabilityReason,
  AwsCapabilityScope,
  AwsCapabilityStatus,
  AwsConfigRecordingFrequencyReview,
  AwsCostOptimizationHubAutoScalingUpgradeConfiguration,
  AwsCostOptimizationHubEbsUpgradeConfiguration,
  AwsCostOptimizationHubEc2UpgradeConfiguration,
  AwsCostOptimizationHubRdsStorageUpgradeConfiguration,
  AwsCostOptimizationHubRdsUpgradeConfiguration,
  AwsCostOptimizationHubUpgradeRecommendation,
  AwsDiscoveryProgressEvent,
  AwsEvidenceCacheOptions,
  AwsEvidenceProvenance,
  CloudBurnClient,
  EvidenceCacheStore,
  EvidenceProvenance,
  FinancialEvidence,
  FindingImpact,
  FindingRecommendation,
  ImpactPeriod,
  ImpactUnknownReason,
  ImpactWindow,
  LiveEvaluationCoverage,
  RecommendationIdentity,
  RuleEvaluation,
} from '../src/index.js';

const reusableScan = async (
  client: CloudBurnClient,
  store: EvidenceCacheStore,
): Promise<AwsEvidenceProvenance[] | undefined> => {
  const cache: AwsEvidenceCacheOptions = {
    store,
    authorizationContext: 'policy-v2',
    mode: 'refresh',
    ttlMs: { catalog: 180_000, datasets: { 'aws-ebs-volumes': 600_000 }, pricing: 43_200_000 },
  };
  const result = await client.discover({ cache });
  // @ts-expect-error An unsupported cache mode must not silently become normal mode.
  void client.discover({ cache: { mode: 'stale' } });
  return result.evidence;
};
void reusableScan;

const consumeDiscoveryProgress = (event: AwsDiscoveryProgressEvent): number => {
  switch (event.kind) {
    case 'catalog':
      return event.resourceCount;
    case 'dataset':
      return event.completedDatasets;
    case 'rule': {
      const status: RuleEvaluation['status'] = event.status;
      const provisional: true = event.provisional;
      // @ts-expect-error Progress can never claim to be an authoritative final result.
      const final: false = event.provisional;
      void [status, provisional, final];
      return event.findingCount + event.findings.length + event.elapsedMs;
    }
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
};
void consumeDiscoveryProgress;

describe('public SDK contracts', () => {
  // The package typecheck task covers this file, so the type-level assertions below fail `pnpm typecheck` directly.
  it('exports upgrade configurations, evaluation coverage and Config evidence with the documented shapes', () => {
    const shapes: [
      AwsCostOptimizationHubEc2UpgradeConfiguration,
      AwsCostOptimizationHubAutoScalingUpgradeConfiguration,
      AwsCostOptimizationHubEbsUpgradeConfiguration,
      AwsCostOptimizationHubRdsUpgradeConfiguration,
      AwsCostOptimizationHubRdsStorageUpgradeConfiguration,
    ] = [
      { instance: { type: 'm7i.large' } },
      { type: 'MixedInstanceTypes', mixedInstances: [{ type: 'm7i.large' }], allocationStrategy: 'Prioritized' },
      { storage: { type: 'gp3', sizeInGb: 100 } },
      { instance: { dbInstanceClass: 'db.m6i.large' } },
      { storageType: 'gp3', allocatedStorageInGb: 100 },
    ];
    const type: AwsCostOptimizationHubUpgradeRecommendation['actionType'] = 'Upgrade';
    expect(type).toBe('Upgrade');
    expect(shapes).toHaveLength(5);

    const provenance: EvidenceProvenance = {
      source: 'aws-cost-optimization-hub',
      sourceDetail: 'ComputeOptimizer',
      sourceId: 'rec-1',
      refreshedAt: '2026-09-04T00:00:00.000Z',
    };
    const identity: RecommendationIdentity = {
      resourceKey: '["resource",1,"aws","123456789012","eu-west-1","ec2:volume","vol-1"]',
      opportunityId: '["opportunity",1,"aws","123456789012","eu-west-1","ec2:volume","vol-1","Delete"]',
    };
    const recommendation: FindingRecommendation = { ...provenance, ...identity };
    // @ts-expect-error Recommendation provenance always requires a source.
    const missingSource: EvidenceProvenance = { sourceId: 'rec-1' };
    expect(recommendation.opportunityId).toContain('"Delete"');
    expect(missingSource).toBeDefined();

    const coverage: LiveEvaluationCoverage = { assessed: [], unknown: [{ resourceId: 'function' }] };
    const evaluation: Pick<RuleEvaluation, 'status' | 'coverage'> = { coverage, status: 'unknown' };
    const evidence: Pick<
      AwsConfigRecordingFrequencyReview,
      | 'configurationItemsRecorded'
      | 'estimatedMonthlyConfigurationItemReduction'
      | 'estimatedMonthlyRecordingCostReductionUsd'
    > = {
      configurationItemsRecorded: null,
      estimatedMonthlyConfigurationItemReduction: null,
      estimatedMonthlyRecordingCostReductionUsd: null,
    };
    // @ts-expect-error Unknown metric evidence must be checked before arithmetic.
    const volume: number = evidence.configurationItemsRecorded;
    // @ts-expect-error Coverage identities require a resource ID.
    const invalidCoverage: LiveEvaluationCoverage = { assessed: [{}], unknown: [] };
    expect([evaluation, volume, invalidCoverage]).toHaveLength(3);
  });

  it('narrows financial evidence by confidence and keeps metrics independent', () => {
    const amount = (evidence: FinancialEvidence): number | undefined =>
      evidence.confidence === 'unknown' ? undefined : evidence.amount;
    const known: FinancialEvidence = { amount: 42.5, confidence: 'exact', currency: 'EUR', period: 'month' };
    const unknown: FinancialEvidence = {
      confidence: 'unknown',
      currency: 'USD',
      period: 'month',
      reason: { code: 'missing_amount', message: 'The source did not provide a usable amount.' },
    };
    expect(amount(known)).toBe(42.5);
    expect(amount(unknown)).toBeUndefined();
    if (known.confidence === 'exact') {
      expectTypeOf(known.amount).toEqualTypeOf<number>();
    }
    if (unknown.confidence === 'unknown') {
      expectTypeOf(unknown.amount).toEqualTypeOf<undefined>();
    }

    const impact: FindingImpact = {
      source: 'billing',
      currentCost: unknown,
      potentialSavings: known,
      window: { lookbackDays: 14 },
    };
    expect(impact.currentCost.confidence).toBe('unknown');
    expect(impact.potentialSavings.confidence).toBe('exact');
    const period: ImpactPeriod = 'hour';
    const reason: ImpactUnknownReason = { code: 'not_provided', message: 'none' };
    const window: ImpactWindow = { start: '2026-08-01T00:00:00.000Z' };
    expect([period, reason, window]).toHaveLength(3);
  });

  it('keeps capability outcome types exhaustively consumable', () => {
    const consumeCapability = (outcome: AwsCapabilityOutcome): AwsCapabilityReason[] => {
      const status: AwsCapabilityStatus = outcome.status;
      const scope: AwsCapabilityScope = outcome.scope;
      switch (scope.type) {
        case 'account':
        case 'all-regions':
          break;
        case 'regional':
          scope.regions.map((region) => region.toLowerCase());
          break;
        case 'recommendation-source':
          scope.accountId.toLowerCase();
          scope.region?.toLowerCase();
          break;
        default: {
          const exhaustive: never = scope;
          return exhaustive;
        }
      }
      switch (status) {
        case 'available':
        case 'partial':
        case 'unavailable':
        case 'error':
          break;
        default: {
          const exhaustive: never = status;
          return exhaustive;
        }
      }
      // @ts-expect-error Capability names stay bounded to the AWS capability catalog.
      const invalidCapability: AwsCapabilityOutcome['capability'] = 'billing-export-access';
      // @ts-expect-error Reasons stay bounded so classifiers never emit free-form text.
      const invalidReason: AwsCapabilityReason = 'unknown-error';
      // @ts-expect-error Scopes stay bounded to account, regional, or recommendation-source evidence.
      const invalidScope: AwsCapabilityScope = { type: 'organization' };
      void invalidCapability;
      void invalidReason;
      void invalidScope;
      return outcome.reasons;
    };
    void consumeCapability;
  });
});
