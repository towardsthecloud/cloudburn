import { describe, expect, it } from 'vitest';
import { rdsIdleInstanceRule } from '../src/aws/rds/idle-instance.js';
import type { AwsRdsInstanceActivity } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createInstance = (overrides: Partial<AwsRdsInstanceActivity> = {}): AwsRdsInstanceActivity => ({
  accountId: '123456789012',
  dbInstanceIdentifier: 'legacy-db',
  instanceClass: 'db.m6i.large',
  maxDatabaseConnectionsLast7Days: 0,
  region: 'us-east-1',
  ...overrides,
});

describe('rdsIdleInstanceRule', () => {
  it('flags idle DB instances in discovery mode', () => {
    const finding = rdsIdleInstanceRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instance-activity': [createInstance()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-RDS-2',
      service: 'rds',
      source: 'discovery',
      message: 'RDS DB instances should not remain idle for 7 days.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'legacy-db',
        },
      ],
    });
  });

  it('skips DB instances with recent connections', () => {
    const finding = rdsIdleInstanceRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instance-activity': [createInstance({ maxDatabaseConnectionsLast7Days: 2 })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips DB instances when connection coverage is unknown', () => {
    const finding = rdsIdleInstanceRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instance-activity': [createInstance({ maxDatabaseConnectionsLast7Days: null })],
      }),
    });

    expect(finding).toBeNull();
  });
});
