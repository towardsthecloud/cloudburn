import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rdsManualSnapshotMaxAgeRule } from '../src/aws/rds/manual-snapshot-max-age.js';
import type { AwsRdsSnapshot } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createSnapshot = (overrides: Partial<AwsRdsSnapshot> = {}): AwsRdsSnapshot => ({
  accountId: '123456789012',
  dbInstanceIdentifier: 'orders-db',
  dbSnapshotIdentifier: 'orders-db-manual-old',
  region: 'us-east-1',
  snapshotCreateTime: '2025-09-01T00:00:00.000Z',
  snapshotType: 'manual',
  ...overrides,
});

describe('rdsManualSnapshotMaxAgeRule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flags manual snapshots older than 90 days', () => {
    const finding = rdsManualSnapshotMaxAgeRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-snapshots': [createSnapshot()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-RDS-10',
      service: 'rds',
      source: 'discovery',
      message: 'Manual RDS snapshots older than 90 days should be reviewed for cleanup.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'orders-db-manual-old',
        },
      ],
    });
  });

  it('skips snapshots that are younger than the review window', () => {
    const finding = rdsManualSnapshotMaxAgeRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-snapshots': [
          createSnapshot({
            dbSnapshotIdentifier: 'orders-db-manual-recent',
            snapshotCreateTime: '2025-12-15T00:00:00.000Z',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips automated snapshots and snapshots with invalid timestamps', () => {
    const finding = rdsManualSnapshotMaxAgeRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-snapshots': [
          createSnapshot({
            dbSnapshotIdentifier: 'orders-db-automated-old',
            snapshotType: 'automated',
          }),
          createSnapshot({
            dbSnapshotIdentifier: 'orders-db-manual-invalid',
            snapshotCreateTime: 'not-a-timestamp',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
