import { describe, expect, it } from 'vitest';
import { kmsKeyChurnRule } from '../src/aws/kms/key-churn.js';
import type { AwsKmsKeyChurnReview } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createReview = (overrides: Partial<AwsKmsKeyChurnReview> = {}): AwsKmsKeyChurnReview => ({
  accountId: '123456789012',
  aliasPatternGroups: [{ keyCount: 12, patternId: 'pattern-123456789abc' }],
  aliasPatternsAvailable: true,
  creationWindowEnd: '2026-09-01T00:00:00.000Z',
  creationWindowStart: '2026-08-01T00:00:00.000Z',
  enabledCustomerManagedKeyCount: 50,
  estimatedMonthlyStorageCostUsd: 52,
  keyMetadataComplete: true,
  keyMetadataUnavailableCount: 0,
  keys: [],
  keysCreatedInWindow: 8,
  multiRegionKeyCount: 2,
  noKmsUsageSinceCreationKeyCount: 4,
  region: 'eu-central-1',
  reviewId: 'kms-key-churn/eu-central-1',
  rotatedKeyCount: 2,
  storageCostEstimateComplete: true,
  unobservedBeforeTrackingKeyCount: 3,
  usageMetadataUnavailableKeyCount: 1,
  usedKeyCount: 42,
  ...overrides,
});

const evaluate = (review: AwsKmsKeyChurnReview) =>
  kmsKeyChurnRule.evaluateLive?.({
    catalog: { indexType: 'LOCAL', resources: [], searchRegion: 'eu-central-1' },
    resources: new LiveResourceBag({
      'aws-kms-key-churn-reviews': [review],
    }),
  });

describe('CLDBRN-AWS-KMS-1', () => {
  it('flags a region with 50 enabled customer-managed keys', () => {
    expect(evaluate(createReview())).toEqual({
      findings: [
        {
          accountId: '123456789012',
          region: 'eu-central-1',
          resourceId: 'kms-key-churn/eu-central-1',
        },
      ],
      message:
        'Regions with many enabled customer-managed KMS keys or rapid key creation should review key lifecycle and consolidation opportunities.',
      ruleId: 'CLDBRN-AWS-KMS-1',
      service: 'kms',
      severity: 'medium',
      source: 'discovery',
    });
    expect(kmsKeyChurnRule.discoveryDependencies).toEqual(['aws-kms-key-churn-reviews']);
  });

  it('flags rapid creation during the previous full month even below the proliferation threshold', () => {
    expect(
      evaluate(
        createReview({
          enabledCustomerManagedKeyCount: 20,
          keysCreatedInWindow: 10,
        }),
      ),
    ).not.toBeNull();
  });

  it('keeps churn review separate from an unused-key claim when usage metadata is unavailable', () => {
    const finding = evaluate(
      createReview({
        enabledCustomerManagedKeyCount: 20,
        keysCreatedInWindow: 10,
        noKmsUsageSinceCreationKeyCount: 0,
        usageMetadataUnavailableKeyCount: 20,
        usedKeyCount: 0,
      }),
    );

    expect(finding?.message.toLowerCase()).not.toContain('unused');
    expect(finding?.message.toLowerCase()).not.toContain('delete');
    expect(finding?.message.toLowerCase()).not.toContain('disable');
  });

  it('passes regions below both review thresholds', () => {
    expect(
      evaluate(
        createReview({
          enabledCustomerManagedKeyCount: 49,
          keysCreatedInWindow: 9,
        }),
      ),
    ).toBeNull();
  });
});
