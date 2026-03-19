import { describe, expect, it } from 'vitest';
import { emrIdleClusterRule } from '../src/aws/emr/idle-cluster.js';
import type { AwsEmrCluster, AwsEmrClusterMetric } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createCluster = (overrides: Partial<AwsEmrCluster> = {}): AwsEmrCluster => ({
  accountId: '123456789012',
  clusterId: 'j-CLUSTER1',
  clusterName: 'analytics',
  instanceTypes: ['m8g.xlarge'],
  normalizedInstanceHours: 240,
  readyDateTime: '2026-03-01T00:00:00.000Z',
  region: 'us-east-1',
  state: 'WAITING',
  ...overrides,
});

const createMetric = (overrides: Partial<AwsEmrClusterMetric> = {}): AwsEmrClusterMetric => ({
  accountId: '123456789012',
  clusterId: 'j-CLUSTER1',
  idlePeriodsLast30Minutes: 6,
  region: 'us-east-1',
  ...overrides,
});

describe('emrIdleClusterRule', () => {
  it('flags active EMR clusters that remain idle for more than 30 minutes', () => {
    const finding = emrIdleClusterRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-emr-cluster-metrics': [createMetric()],
        'aws-emr-clusters': [createCluster()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EMR-2',
      service: 'emr',
      source: 'discovery',
      message: 'EMR clusters idle for more than 30 minutes should be reviewed.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'j-CLUSTER1',
        },
      ],
    });
  });

  it('skips clusters without full idle coverage or that have already ended', () => {
    const finding = emrIdleClusterRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-emr-cluster-metrics': [createMetric({ idlePeriodsLast30Minutes: null })],
        'aws-emr-clusters': [createCluster({ endDateTime: '2026-03-10T00:00:00.000Z' })],
      }),
    });

    expect(finding).toBeNull();
  });
});
