import { describe, expect, it } from 'vitest';
import { redshiftPauseResumeRule } from '../src/aws/redshift/pause-resume.js';
import type { AwsRedshiftCluster } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createCluster = (overrides: Partial<AwsRedshiftCluster> = {}): AwsRedshiftCluster => ({
  accountId: '123456789012',
  automatedSnapshotRetentionPeriod: 1,
  clusterCreateTime: '2025-01-01T00:00:00.000Z',
  clusterIdentifier: 'warehouse-prod',
  clusterStatus: 'available',
  hasPauseSchedule: false,
  hasResumeSchedule: true,
  hsmEnabled: false,
  multiAz: 'disabled',
  nodeType: 'ra3.xlplus',
  numberOfNodes: 2,
  region: 'us-east-1',
  vpcId: 'vpc-123',
  ...overrides,
});

describe('redshiftPauseResumeRule', () => {
  it('flags eligible clusters that are missing a pause or resume schedule', () => {
    const finding = redshiftPauseResumeRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-redshift-clusters': [createCluster()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-REDSHIFT-3',
      service: 'redshift',
      source: 'discovery',
      message: 'Redshift clusters should enable both pause and resume schedules when eligible.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'warehouse-prod',
        },
      ],
    });
  });

  it('skips ineligible clusters or clusters that already have both schedules', () => {
    const finding = redshiftPauseResumeRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-redshift-clusters': [
          createCluster({ clusterIdentifier: 'warehouse-covered', hasPauseSchedule: true, hasResumeSchedule: true }),
          createCluster({ clusterIdentifier: 'warehouse-ineligible', automatedSnapshotRetentionPeriod: 0 }),
          createCluster({ clusterIdentifier: 'warehouse-schedule-state-missing', pauseResumeStateAvailable: false }),
          createCluster({
            automatedSnapshotRetentionPeriod: undefined,
            clusterIdentifier: 'warehouse-unknown-snapshots',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
