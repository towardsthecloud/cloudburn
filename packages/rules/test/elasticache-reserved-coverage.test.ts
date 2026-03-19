import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { elastiCacheReservedCoverageRule } from '../src/aws/elasticache/reserved-coverage.js';
import type { AwsElastiCacheCluster, AwsElastiCacheReservedNode } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createCluster = (overrides: Partial<AwsElastiCacheCluster> = {}): AwsElastiCacheCluster => ({
  accountId: '123456789012',
  cacheClusterCreateTime: '2025-01-01T00:00:00.000Z',
  cacheClusterId: 'cache-prod',
  cacheClusterStatus: 'available',
  cacheNodeType: 'cache.r6g.large',
  engine: 'redis',
  numCacheNodes: 2,
  region: 'us-east-1',
  ...overrides,
});

const createReservedNode = (overrides: Partial<AwsElastiCacheReservedNode> = {}): AwsElastiCacheReservedNode => ({
  accountId: '123456789012',
  cacheNodeCount: 2,
  cacheNodeType: 'cache.r6g.large',
  productDescription: 'redis',
  region: 'us-east-1',
  reservedCacheNodeId: 'reserved-cache-prod',
  startTime: '2025-01-01T00:00:00.000Z',
  state: 'active',
  ...overrides,
});

describe('elastiCacheReservedCoverageRule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flags long-running clusters without reserved-node coverage', () => {
    const finding = elastiCacheReservedCoverageRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-elasticache-clusters': [createCluster()],
        'aws-elasticache-reserved-nodes': [],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-ELASTICACHE-1',
      service: 'elasticache',
      source: 'discovery',
      message: 'Long-running ElastiCache clusters should have reserved node coverage.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'cache-prod',
        },
      ],
    });
  });

  it('skips clusters that are covered or not yet long-running', () => {
    const finding = elastiCacheReservedCoverageRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-elasticache-clusters': [
          createCluster({ cacheClusterId: 'cache-covered' }),
          createCluster({ cacheClusterId: 'cache-new', cacheClusterCreateTime: '2026-02-01T00:00:00.000Z' }),
        ],
        'aws-elasticache-reserved-nodes': [createReservedNode()],
      }),
    });

    expect(finding).toBeNull();
  });

  it('treats ElastiCache reservations as size-flexible within a node family', () => {
    const finding = elastiCacheReservedCoverageRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-elasticache-clusters': [createCluster()],
        'aws-elasticache-reserved-nodes': [
          createReservedNode({
            cacheNodeCount: 1,
            cacheNodeType: 'cache.r6g.xlarge',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('allows Redis OSS reservations to cover Valkey clusters in the same family', () => {
    const finding = elastiCacheReservedCoverageRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-elasticache-clusters': [createCluster({ engine: 'valkey', numCacheNodes: 1 })],
        'aws-elasticache-reserved-nodes': [createReservedNode({ cacheNodeCount: 1, productDescription: 'redis' })],
      }),
    });

    expect(finding).toBeNull();
  });
});
