import { describe, expect, it, vi } from 'vitest';
import { ebsSnapshotMaxAgeRule } from '../src/aws/ebs/snapshot-max-age.js';
import type { AwsEbsSnapshot } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createSnapshot = (overrides: Partial<AwsEbsSnapshot> = {}): AwsEbsSnapshot => ({
  accountId: '123456789012',
  region: 'eu-west-1',
  snapshotId: 'snap-123',
  startTime: '2025-01-01T00:00:00.000Z',
  state: 'completed',
  volumeId: 'vol-123',
  volumeSizeGiB: 128,
  ...overrides,
});

describe('ebsSnapshotMaxAgeRule', () => {
  it('flags completed snapshots older than the max-age threshold', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-05-01T00:00:00.000Z'));

    const finding = ebsSnapshotMaxAgeRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-snapshots': [createSnapshot()],
      }),
    });

    expect(ebsSnapshotMaxAgeRule.supports).toEqual(['discovery']);
    expect(ebsSnapshotMaxAgeRule.discoveryDependencies).toEqual(['aws-ebs-snapshots']);
    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EBS-8',
      service: 'ebs',
      source: 'discovery',
      message: 'EBS snapshots older than 90 days should be reviewed.',
      findings: [
        {
          accountId: '123456789012',
          region: 'eu-west-1',
          resourceId: 'snap-123',
        },
      ],
    });

    vi.useRealTimers();
  });

  it('does not flag recent, non-completed, or timestamp-less snapshots', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-05-01T00:00:00.000Z'));

    const finding = ebsSnapshotMaxAgeRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-snapshots': [
          createSnapshot({ startTime: '2025-04-01T00:00:00.000Z' }),
          createSnapshot({ snapshotId: 'snap-456', state: 'pending' }),
          createSnapshot({ snapshotId: 'snap-789', startTime: undefined }),
        ],
      }),
    });

    expect(finding).toBeNull();

    vi.useRealTimers();
  });
});
