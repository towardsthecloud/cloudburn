import { describe, expect, it } from 'vitest';
import { rdsGravitonReviewRule } from '../src/aws/rds/graviton-review.js';
import type { AwsRdsInstance } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

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
});
