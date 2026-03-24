import { describe, expect, it } from 'vitest';
import { rdsUnsupportedEngineVersionRule } from '../src/aws/rds/unsupported-engine-version.js';
import type { AwsRdsInstance } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createInstance = (overrides: Partial<AwsRdsInstance> = {}): AwsRdsInstance => ({
  accountId: '123456789012',
  dbInstanceIdentifier: 'legacy-db',
  dbInstanceStatus: 'available',
  engine: 'mysql',
  engineVersion: '5.7.44',
  instanceClass: 'db.m6i.large',
  instanceCreateTime: '2025-01-01T00:00:00.000Z',
  multiAz: false,
  region: 'us-east-1',
  ...overrides,
});

describe('rdsUnsupportedEngineVersionRule', () => {
  it('flags MySQL 5.7 instances that can incur extended support charges', () => {
    const finding = rdsUnsupportedEngineVersionRule.evaluateLive?.({
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
        resourceId: 'legacy-db',
      },
    ]);
  });

  it('flags PostgreSQL 11 instances that can incur extended support charges', () => {
    const finding = rdsUnsupportedEngineVersionRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance({ engine: 'postgres', engineVersion: '11.22' })],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        resourceId: 'legacy-db',
      },
    ]);
  });

  it('skips supported engine versions', () => {
    const finding = rdsUnsupportedEngineVersionRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance({ engineVersion: '8.0.39' })],
      }),
    });

    expect(finding).toBeNull();
  });
});
