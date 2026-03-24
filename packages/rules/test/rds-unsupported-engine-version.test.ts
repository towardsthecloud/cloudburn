import { describe, expect, it } from 'vitest';
import { rdsUnsupportedEngineVersionRule } from '../src/aws/rds/unsupported-engine-version.js';
import type { AwsRdsInstance, AwsStaticRdsInstance } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

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

const createStaticInstance = (overrides: Partial<AwsStaticRdsInstance> = {}): AwsStaticRdsInstance => ({
  resourceId: 'aws_db_instance.legacy',
  instanceClass: 'db.m6i.large',
  engine: 'mysql',
  engineVersion: '5.7.44',
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

  it('flags static MySQL 5.7 instances that can incur extended support charges', () => {
    const finding = rdsUnsupportedEngineVersionRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-rds-instances': [createStaticInstance()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        resourceId: 'aws_db_instance.legacy',
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

  it('skips static supported or unknown engine versions', () => {
    const supportedFinding = rdsUnsupportedEngineVersionRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-rds-instances': [createStaticInstance({ engineVersion: '8.0.39' })],
      }),
    });
    const unknownFinding = rdsUnsupportedEngineVersionRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-rds-instances': [createStaticInstance({ engine: null, engineVersion: null })],
      }),
    });

    expect(supportedFinding).toBeNull();
    expect(unknownFinding).toBeNull();
  });
});
