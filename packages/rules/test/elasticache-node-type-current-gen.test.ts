import { describe, expect, it } from 'vitest';
import { elastiCacheNodeTypeCurrentGenRule } from '../src/aws/elasticache/node-type-current-gen.js';
import type { AwsElastiCacheCluster, AwsStaticElastiCacheCluster } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const RULE_MESSAGE = 'ElastiCache clusters should use current-generation node types.';

const createCluster = (overrides: Partial<AwsElastiCacheCluster> = {}): AwsElastiCacheCluster => ({
  accountId: '123456789012',
  cacheClusterId: 'sessions',
  cacheClusterStatus: 'available',
  cacheNodeType: 'cache.m4.large',
  engine: 'redis',
  numCacheNodes: 2,
  region: 'us-east-1',
  ...overrides,
});

const createStaticCluster = (overrides: Partial<AwsStaticElastiCacheCluster> = {}): AwsStaticElastiCacheCluster => ({
  cacheNodeType: 'cache.m4.large',
  location: {
    path: 'main.tf',
    line: 2,
    column: 3,
  },
  resourceId: 'aws_elasticache_cluster.sessions',
  ...overrides,
});

describe('elastiCacheNodeTypeCurrentGenRule', () => {
  it('flags live clusters on previous-generation node families', () => {
    const finding = elastiCacheNodeTypeCurrentGenRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-elasticache-clusters': [createCluster()],
      }),
    });

    expect(elastiCacheNodeTypeCurrentGenRule.discoveryDependencies).toEqual(['aws-elasticache-clusters']);
    expect(elastiCacheNodeTypeCurrentGenRule.staticDependencies).toEqual(['aws-elasticache-clusters']);
    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-ELASTICACHE-3',
      service: 'elasticache',
      severity: 'medium',
      source: 'discovery',
      message: RULE_MESSAGE,
      findings: [
        {
          resourceId: 'sessions',
          region: 'us-east-1',
          accountId: '123456789012',
        },
      ],
    });
  });

  it('passes live clusters on current-generation node families', () => {
    const finding = elastiCacheNodeTypeCurrentGenRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-elasticache-clusters': [createCluster({ cacheNodeType: 'cache.r7g.large' })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips live clusters that are not available', () => {
    const finding = elastiCacheNodeTypeCurrentGenRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-elasticache-clusters': [createCluster({ cacheClusterStatus: 'deleting' })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('flags Terraform clusters on previous-generation node families', () => {
    const finding = elastiCacheNodeTypeCurrentGenRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-elasticache-clusters': [createStaticCluster()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-ELASTICACHE-3',
      service: 'elasticache',
      severity: 'medium',
      source: 'iac',
      message: RULE_MESSAGE,
      findings: [
        {
          resourceId: 'aws_elasticache_cluster.sessions',
          location: {
            path: 'main.tf',
            line: 2,
            column: 3,
          },
        },
      ],
    });
  });

  it('flags CloudFormation clusters on previous-generation node families', () => {
    const finding = elastiCacheNodeTypeCurrentGenRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-elasticache-clusters': [
          createStaticCluster({
            cacheNodeType: 'cache.t2.micro',
            location: {
              path: 'template.yaml',
              line: 6,
              column: 7,
            },
            resourceId: 'SessionsCache',
          }),
        ],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-ELASTICACHE-3',
      service: 'elasticache',
      severity: 'medium',
      source: 'iac',
      message: RULE_MESSAGE,
      findings: [
        {
          resourceId: 'SessionsCache',
          location: {
            path: 'template.yaml',
            line: 6,
            column: 7,
          },
        },
      ],
    });
  });

  it('skips static clusters that leave the node type unresolved', () => {
    const finding = elastiCacheNodeTypeCurrentGenRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-elasticache-clusters': [createStaticCluster({ cacheNodeType: null })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('passes static clusters on current-generation node families', () => {
    const finding = elastiCacheNodeTypeCurrentGenRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-elasticache-clusters': [createStaticCluster({ cacheNodeType: 'cache.m7g.large' })],
      }),
    });

    expect(finding).toBeNull();
  });
});
