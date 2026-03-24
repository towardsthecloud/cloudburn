import { describe, expect, it } from 'vitest';
import { rdsUnusedSnapshotsRule } from '../src/aws/rds/unused-snapshots.js';
import type { AwsRdsInstance, AwsRdsSnapshot } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createInstance = (overrides: Partial<AwsRdsInstance> = {}): AwsRdsInstance => ({
  accountId: '123456789012',
  dbInstanceIdentifier: 'active-db',
  dbInstanceStatus: 'available',
  engine: 'mysql',
  engineVersion: '8.0.39',
  instanceClass: 'db.m6i.large',
  instanceCreateTime: '2025-01-01T00:00:00.000Z',
  multiAz: false,
  region: 'us-east-1',
  ...overrides,
});

const createSnapshot = (overrides: Partial<AwsRdsSnapshot> = {}): AwsRdsSnapshot => ({
  accountId: '123456789012',
  dbInstanceIdentifier: 'deleted-db',
  dbSnapshotIdentifier: 'snapshot-123',
  region: 'us-east-1',
  snapshotCreateTime: '2026-01-01T00:00:00.000Z',
  snapshotType: 'manual',
  ...overrides,
});

describe('rdsUnusedSnapshotsRule', () => {
  it('flags orphaned RDS snapshots older than the grace period', () => {
    const finding = rdsUnusedSnapshotsRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance()],
        'aws-rds-snapshots': [createSnapshot()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        resourceId: 'snapshot-123',
      },
    ]);
  });

  it('skips snapshots whose source DB instance still exists', () => {
    const finding = rdsUnusedSnapshotsRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance({ dbInstanceIdentifier: 'deleted-db' })],
        'aws-rds-snapshots': [createSnapshot()],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips recently created orphaned snapshots during the grace period', () => {
    const finding = rdsUnusedSnapshotsRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance()],
        'aws-rds-snapshots': [createSnapshot({ snapshotCreateTime: '2026-03-10T00:00:00.000Z' })],
      }),
    });

    expect(finding).toBeNull();
  });
});
