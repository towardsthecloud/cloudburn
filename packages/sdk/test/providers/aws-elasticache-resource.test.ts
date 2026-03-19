import type { DescribeCacheClustersCommand, DescribeReservedCacheNodesCommand } from '@aws-sdk/client-elasticache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElastiCacheClient } from '../../src/providers/aws/client.js';
import {
  hydrateAwsElastiCacheClusters,
  hydrateAwsElastiCacheReservedNodes,
} from '../../src/providers/aws/resources/elasticache.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createElastiCacheClient: vi.fn(),
}));

const mockedCreateElastiCacheClient = vi.mocked(createElastiCacheClient);

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
});
