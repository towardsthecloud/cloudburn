import { describe, expect, it } from 'vitest';
import { elastiCacheIdleClusterRule } from '../src/aws/elasticache/idle-cluster.js';
import type { AwsElastiCacheCluster, AwsElastiCacheClusterActivity } from '../src/index.js';
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

const createActivity = (overrides: Partial<AwsElastiCacheClusterActivity> = {}): AwsElastiCacheClusterActivity => ({
  accountId: '123456789012',
  averageCacheHitRateLast14Days: 4.9,
  averageCurrentConnectionsLast14Days: 1.9,
  cacheClusterId: 'cache-prod',
  region: 'us-east-1',
  ...overrides,
});

describe('elastiCacheIdleClusterRule', () => {
  it('flags available clusters with low hit rates and fewer than 2 average connections', () => {
    const finding = elastiCacheIdleClusterRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-elasticache-cluster-activity': [createActivity()],
        'aws-elasticache-clusters': [createCluster()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        resourceId: 'cache-prod',
      },
    ]);
  });

  it('skips clusters with incomplete metric coverage', () => {
    const finding = elastiCacheIdleClusterRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-elasticache-cluster-activity': [createActivity({ averageCacheHitRateLast14Days: null })],
        'aws-elasticache-clusters': [createCluster()],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips non-available clusters', () => {
    const finding = elastiCacheIdleClusterRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-elasticache-cluster-activity': [createActivity()],
        'aws-elasticache-clusters': [createCluster({ cacheClusterStatus: 'modifying' })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips clusters at or above the hit-rate or connection thresholds', () => {
    const finding = elastiCacheIdleClusterRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-elasticache-cluster-activity': [
          createActivity({ averageCacheHitRateLast14Days: 5, averageCurrentConnectionsLast14Days: 1 }),
          createActivity({
            averageCacheHitRateLast14Days: 4,
            averageCurrentConnectionsLast14Days: 2,
            cacheClusterId: 'cache-prod-2',
          }),
        ],
        'aws-elasticache-clusters': [createCluster(), createCluster({ cacheClusterId: 'cache-prod-2' })],
      }),
    });

    expect(finding).toBeNull();
  });
});
