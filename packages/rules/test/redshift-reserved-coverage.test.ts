import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redshiftReservedCoverageRule } from '../src/aws/redshift/reserved-coverage.js';
import type { AwsRedshiftCluster, AwsRedshiftReservedNode } from '../src/index.js';
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

const createReservedNode = (overrides: Partial<AwsRedshiftReservedNode> = {}): AwsRedshiftReservedNode => ({
  accountId: '123456789012',
  nodeCount: 2,
  nodeType: 'ra3.xlplus',
  region: 'us-east-1',
  reservedNodeId: 'reserved-node-1',
  startTime: '2025-01-01T00:00:00.000Z',
  state: 'active',
  ...overrides,
});

describe('redshiftReservedCoverageRule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flags long-running Redshift clusters without reserved-node coverage', () => {
    const finding = redshiftReservedCoverageRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-redshift-clusters': [createCluster()],
        'aws-redshift-reserved-nodes': [],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-REDSHIFT-2',
      service: 'redshift',
      source: 'discovery',
      message: 'Long-running Redshift clusters should have reserved node coverage.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'warehouse-prod',
        },
      ],
    });
  });

  it('skips clusters that are covered or not yet long-running', () => {
    const finding = redshiftReservedCoverageRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-redshift-clusters': [
          createCluster({ clusterIdentifier: 'warehouse-covered' }),
          createCluster({ clusterIdentifier: 'warehouse-new', clusterCreateTime: '2026-02-01T00:00:00.000Z' }),
        ],
        'aws-redshift-reserved-nodes': [createReservedNode()],
      }),
    });

    expect(finding).toBeNull();
  });
});
