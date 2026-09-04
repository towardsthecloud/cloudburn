import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { kmsKeyUnusedRule } from '../src/aws/kms/key-unused.js';
import type { AwsKmsKeyUsage } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createKey = (overrides: Partial<AwsKmsKeyUsage> = {}): AwsKmsKeyUsage => ({
  accountId: '123456789012',
  creationDate: '2026-06-06T00:00:00.000Z',
  estimatedMonthlyStorageCostUsd: 1,
  keyArn: 'arn:aws:kms:eu-central-1:123456789012:key/key-a',
  multiRegion: false,
  region: 'eu-central-1',
  storageCostEstimateComplete: true,
  trackingStartDate: '2026-06-06T00:00:00.000Z',
  usageEvidence: 'no_kms_usage_since_creation',
  ...overrides,
});

const evaluate = (keys: AwsKmsKeyUsage[]) =>
  kmsKeyUnusedRule.evaluateLive?.({
    catalog: { indexType: 'LOCAL', resources: [], searchRegion: 'eu-central-1' },
    resources: new LiveResourceBag({
      'aws-kms-key-usage': keys,
    }),
  });

describe('CLDBRN-AWS-KMS-2', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flags a key with no recorded KMS usage during a complete 90-day window', () => {
    expect(evaluate([createKey()])).toEqual({
      findings: [
        {
          accountId: '123456789012',
          region: 'eu-central-1',
          resourceId: 'arn:aws:kms:eu-central-1:123456789012:key/key-a',
        },
      ],
      message:
        'Customer-managed KMS keys with no recorded cryptographic use for at least 90 days should be disabled and monitored before deletion.',
      ruleId: 'CLDBRN-AWS-KMS-2',
      service: 'kms',
      severity: 'medium',
      source: 'discovery',
    });
    expect(kmsKeyUnusedRule.discoveryDependencies).toEqual(['aws-kms-key-usage']);
  });

  it('does not flag keys younger than 90 days', () => {
    expect(
      evaluate([
        createKey({
          creationDate: '2026-06-06T00:00:00.001Z',
          trackingStartDate: '2026-06-06T00:00:00.001Z',
        }),
      ]),
    ).toBeNull();
  });

  it('flags a mature key whose last recorded use was exactly 90 days ago', () => {
    expect(
      evaluate([
        createKey({
          creationDate: '2025-01-01T00:00:00.000Z',
          lastUsageAt: '2026-06-06T00:00:00.000Z',
          trackingStartDate: '2026-01-01T00:00:00.000Z',
          usageEvidence: 'used',
        }),
      ]),
    ).not.toBeNull();
  });

  it('does not flag a key with recorded use inside the 90-day window', () => {
    expect(
      evaluate([
        createKey({
          creationDate: '2025-01-01T00:00:00.000Z',
          lastUsageAt: '2026-06-06T00:00:00.001Z',
          trackingStartDate: '2026-01-01T00:00:00.000Z',
          usageEvidence: 'used',
        }),
      ]),
    ).toBeNull();
  });

  it('flags an older key with no use during a complete 90-day tracking window', () => {
    expect(
      evaluate([
        createKey({
          creationDate: '2025-01-01T00:00:00.000Z',
          trackingStartDate: '2026-06-06T00:00:00.000Z',
          usageEvidence: 'unobserved_before_tracking',
        }),
      ]),
    ).not.toBeNull();
  });

  it('does not flag a key when tracking covers less than 90 days', () => {
    expect(
      evaluate([
        createKey({
          creationDate: '2025-01-01T00:00:00.000Z',
          trackingStartDate: '2026-06-06T00:00:00.001Z',
          usageEvidence: 'unobserved_before_tracking',
        }),
      ]),
    ).toBeNull();
  });

  it('does not flag a mature key when usage evidence is unavailable', () => {
    expect(
      evaluate([
        createKey({
          creationDate: '2025-01-01T00:00:00.000Z',
          trackingStartDate: undefined,
          usageEvidence: 'unavailable',
        }),
      ]),
    ).toBeNull();
  });

  it('evaluates multi-Region keys independently', () => {
    const result = evaluate([
      createKey({ multiRegion: true }),
      createKey({
        keyArn: 'arn:aws:kms:us-east-1:123456789012:key/key-replica',
        multiRegion: true,
        region: 'us-east-1',
        usageEvidence: 'used',
      }),
    ]);

    expect(result?.findings).toHaveLength(1);
    expect(result?.findings[0]?.resourceId).toContain('eu-central-1');
  });
});
