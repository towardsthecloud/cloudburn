import type { DescribeCacheClustersCommand, DescribeReservedCacheNodesCommand } from '@aws-sdk/client-elasticache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElastiCacheClient } from '../../src/providers/aws/client.js';
import { fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';
import {
  hydrateAwsElastiCacheClusterActivity,
  hydrateAwsElastiCacheClusters,
  hydrateAwsElastiCacheReservedNodes,
} from '../../src/providers/aws/resources/elasticache.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createElastiCacheClient: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/cloudwatch.js', () => ({
  fetchCloudWatchSignals: vi.fn(),
}));

const mockedCreateElastiCacheClient = vi.mocked(createElastiCacheClient);
const mockedFetchCloudWatchSignals = vi.mocked(fetchCloudWatchSignals);

describe('ElastiCache discovery resources', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates discovered ElastiCache clusters from DescribeCacheClusters', async () => {
    mockedCreateElastiCacheClient.mockReturnValue({
      send: vi.fn(async (_command: DescribeCacheClustersCommand) => ({
        CacheClusters: [
          {
            CacheClusterCreateTime: new Date('2025-01-01T00:00:00.000Z'),
            CacheClusterId: 'cache-prod',
            CacheClusterStatus: 'available',
            CacheNodeType: 'cache.r6g.large',
            Engine: 'redis',
            NumCacheNodes: 2,
          },
        ],
      })),
    } as never);

    await expect(
      hydrateAwsElastiCacheClusters([
        {
          accountId: '123456789012',
          arn: 'arn:aws:elasticache:us-east-1:123456789012:cluster:cache-prod',
          properties: [],
          region: 'us-east-1',
          resourceType: 'elasticache:cluster',
          service: 'elasticache',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        cacheClusterCreateTime: '2025-01-01T00:00:00.000Z',
        cacheClusterId: 'cache-prod',
        cacheClusterStatus: 'available',
        cacheNodeType: 'cache.r6g.large',
        engine: 'redis',
        numCacheNodes: 2,
        region: 'us-east-1',
      },
    ]);
  });

  it('hydrates discovered ElastiCache reserved nodes from DescribeReservedCacheNodes', async () => {
    mockedCreateElastiCacheClient.mockReturnValue({
      send: vi.fn(async (_command: DescribeReservedCacheNodesCommand) => ({
        ReservedCacheNodes: [
          {
            CacheNodeCount: 2,
            CacheNodeType: 'cache.r6g.large',
            ProductDescription: 'redis',
            ReservedCacheNodeId: 'reserved-cache-prod',
            StartTime: new Date('2025-01-01T00:00:00.000Z'),
            State: 'active',
          },
        ],
      })),
    } as never);

    await expect(
      hydrateAwsElastiCacheReservedNodes([
        {
          accountId: '123456789012',
          arn: 'arn:aws:elasticache:us-east-1:123456789012:reserved-instance:reserved-cache-prod',
          properties: [],
          region: 'us-east-1',
          resourceType: 'elasticache:reserved-instance',
          service: 'elasticache',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        cacheNodeCount: 2,
        cacheNodeType: 'cache.r6g.large',
        productDescription: 'redis',
        region: 'us-east-1',
        reservedCacheNodeId: 'reserved-cache-prod',
        startTime: '2025-01-01T00:00:00.000Z',
        state: 'active',
      },
    ]);
  });

  it('hydrates 14-day ElastiCache activity for Redis clusters', async () => {
    mockedCreateElastiCacheClient.mockReturnValue({
      send: vi.fn(async (_command: DescribeCacheClustersCommand) => ({
        CacheClusters: [
          {
            CacheClusterCreateTime: new Date('2025-01-01T00:00:00.000Z'),
            CacheClusterId: 'cache-prod',
            CacheClusterStatus: 'available',
            CacheNodeType: 'cache.r6g.large',
            Engine: 'redis',
            NumCacheNodes: 2,
          },
        ],
      })),
    } as never);
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        [
          'hits0',
          Array.from({ length: 14 }, (_, index) => ({
            timestamp: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
            value: 1,
          })),
        ],
        [
          'misses0',
          Array.from({ length: 14 }, (_, index) => ({
            timestamp: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
            value: 19,
          })),
        ],
        [
          'connections0',
          Array.from({ length: 14 }, (_, index) => ({
            timestamp: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
            value: 1,
          })),
        ],
      ]),
    );

    await expect(
      hydrateAwsElastiCacheClusterActivity([
        {
          accountId: '123456789012',
          arn: 'arn:aws:elasticache:us-east-1:123456789012:cluster:cache-prod',
          properties: [],
          region: 'us-east-1',
          resourceType: 'elasticache:cluster',
          service: 'elasticache',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        averageCacheHitRateLast14Days: 5,
        averageCurrentConnectionsLast14Days: 1,
        cacheClusterId: 'cache-prod',
        region: 'us-east-1',
      },
    ]);
  });

  it('preserves incomplete ElastiCache metric coverage as null activity fields', async () => {
    mockedCreateElastiCacheClient.mockReturnValue({
      send: vi.fn(async (_command: DescribeCacheClustersCommand) => ({
        CacheClusters: [
          {
            CacheClusterId: 'cache-prod',
            CacheClusterStatus: 'available',
            CacheNodeType: 'cache.r6g.large',
            Engine: 'redis',
            NumCacheNodes: 2,
          },
        ],
      })),
    } as never);
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        [
          'hits0',
          [
            {
              timestamp: '2026-03-01T00:00:00.000Z',
              value: 1,
            },
          ],
        ],
        [
          'misses0',
          [
            {
              timestamp: '2026-03-01T00:00:00.000Z',
              value: 19,
            },
          ],
        ],
        [
          'connections0',
          [
            {
              timestamp: '2026-03-01T00:00:00.000Z',
              value: 1,
            },
          ],
        ],
      ]),
    );

    await expect(
      hydrateAwsElastiCacheClusterActivity([
        {
          accountId: '123456789012',
          arn: 'arn:aws:elasticache:us-east-1:123456789012:cluster:cache-prod',
          properties: [],
          region: 'us-east-1',
          resourceType: 'elasticache:cluster',
          service: 'elasticache',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        averageCacheHitRateLast14Days: null,
        averageCurrentConnectionsLast14Days: null,
        cacheClusterId: 'cache-prod',
        region: 'us-east-1',
      },
    ]);
  });
});
