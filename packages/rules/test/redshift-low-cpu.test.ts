import { describe, expect, it } from 'vitest';
import { redshiftLowCpuRule } from '../src/aws/redshift/low-cpu.js';
import type { AwsRedshiftCluster, AwsRedshiftClusterMetric } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createCluster = (overrides: Partial<AwsRedshiftCluster> = {}): AwsRedshiftCluster => ({
  accountId: '123456789012',
  automatedSnapshotRetentionPeriod: 1,
  clusterCreateTime: '2025-01-01T00:00:00.000Z',
  clusterIdentifier: 'warehouse-prod',
  clusterStatus: 'available',
  hasPauseSchedule: false,
  hasResumeSchedule: false,
  hsmEnabled: false,
  multiAz: 'disabled',
  nodeType: 'ra3.xlplus',
  numberOfNodes: 2,
  region: 'us-east-1',
  vpcId: 'vpc-123',
  ...overrides,
});

const createMetric = (overrides: Partial<AwsRedshiftClusterMetric> = {}): AwsRedshiftClusterMetric => ({
  accountId: '123456789012',
  averageCpuUtilizationLast14Days: 4,
  clusterIdentifier: 'warehouse-prod',
  region: 'us-east-1',
  ...overrides,
});

describe('redshiftLowCpuRule', () => {
  it('flags available Redshift clusters with sustained low CPU utilization', () => {
    const finding = redshiftLowCpuRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-redshift-cluster-metrics': [createMetric()],
        'aws-redshift-clusters': [createCluster()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-REDSHIFT-1',
      service: 'redshift',
      source: 'discovery',
      message: 'Redshift clusters with low CPU utilization should be reviewed.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'warehouse-prod',
        },
      ],
    });
  });

  it('skips clusters without low CPU utilization or that are not available', () => {
    const finding = redshiftLowCpuRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-redshift-cluster-metrics': [createMetric({ averageCpuUtilizationLast14Days: 12 })],
        'aws-redshift-clusters': [createCluster({ clusterStatus: 'paused' })],
      }),
    });

    expect(finding).toBeNull();
  });
});
