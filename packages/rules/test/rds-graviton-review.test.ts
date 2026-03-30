import { describe, expect, it } from 'vitest';
import { rdsGravitonReviewRule } from '../src/aws/rds/graviton-review.js';
import type { AwsRdsInstance, AwsStaticRdsInstance } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const createInstance = (overrides: Partial<AwsRdsInstance> = {}): AwsRdsInstance => ({
  accountId: '123456789012',
  dbInstanceIdentifier: 'prod-db',
  dbInstanceStatus: 'available',
  engine: 'mysql',
  engineVersion: '8.0.39',
  instanceClass: 'db.m6i.large',
  instanceCreateTime: '2025-01-01T00:00:00.000Z',
  multiAz: false,
  region: 'us-east-1',
  ...overrides,
});

const createStaticInstance = (overrides: Partial<AwsStaticRdsInstance> = {}): AwsStaticRdsInstance => ({
  resourceId: 'aws_db_instance.primary',
  instanceClass: 'db.m6i.large',
  engine: 'mysql',
  engineVersion: '8.0.39',
  performanceInsightsEnabled: false,
  performanceInsightsRetentionPeriod: undefined,
  ...overrides,
});

describe('rdsGravitonReviewRule', () => {
  it('flags RDS instance classes with a curated Graviton equivalent', () => {
    const finding = rdsGravitonReviewRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        resourceId: 'prod-db',
      },
    ]);
  });

  it('flags static RDS instance classes with a curated Graviton equivalent', () => {
    const finding = rdsGravitonReviewRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-rds-instances': [createStaticInstance()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        resourceId: 'aws_db_instance.primary',
      },
    ]);
  });

  it('skips RDS instance classes already using Graviton families', () => {
    const finding = rdsGravitonReviewRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance({ instanceClass: 'db.m7g.large' })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips unclassified RDS instance families', () => {
    const finding = rdsGravitonReviewRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance({ instanceClass: 'db.x2g.large' })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips static Graviton or unclassified RDS instance families', () => {
    const gravitonFinding = rdsGravitonReviewRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-rds-instances': [createStaticInstance({ instanceClass: 'db.m7g.large' })],
      }),
    });
    const unclassifiedFinding = rdsGravitonReviewRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-rds-instances': [createStaticInstance({ instanceClass: 'db.x2g.large' })],
      }),
    });

    expect(gravitonFinding).toBeNull();
    expect(unclassifiedFinding).toBeNull();
  });
});
