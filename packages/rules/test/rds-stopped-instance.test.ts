import { describe, expect, it } from 'vitest';
import { rdsStoppedInstanceRule } from '../src/aws/rds/stopped-instance.js';
import type { AwsRdsInstance } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createInstance = (overrides: Partial<AwsRdsInstance> = {}): AwsRdsInstance => ({
  accountId: '123456789012',
  dbInstanceIdentifier: 'stopped-db',
  dbInstanceStatus: 'stopped',
  engine: 'postgres',
  engineVersion: '16.2',
  instanceClass: 'db.m7g.large',
  instanceCreateTime: '2025-01-01T00:00:00.000Z',
  multiAz: false,
  region: 'us-east-1',
  ...overrides,
});

describe('rdsStoppedInstanceRule', () => {
  it('flags stopped DB instances in discovery mode', () => {
    const finding = rdsStoppedInstanceRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-RDS-9',
      service: 'rds',
      source: 'discovery',
      message: 'Stopped RDS DB instances should be reviewed for cleanup.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'stopped-db',
        },
      ],
    });
  });

  it('skips DB instances that are not stopped', () => {
    const finding = rdsStoppedInstanceRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance({ dbInstanceIdentifier: 'running-db', dbInstanceStatus: 'available' })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('returns only stopped DB instances from mixed discovery results', () => {
    const finding = rdsStoppedInstanceRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [
          createInstance(),
          createInstance({ dbInstanceIdentifier: 'running-db', dbInstanceStatus: 'available' }),
          createInstance({ dbInstanceIdentifier: 'stopped-db-2', region: 'eu-west-1' }),
        ],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        resourceId: 'stopped-db',
      },
      {
        accountId: '123456789012',
        region: 'eu-west-1',
        resourceId: 'stopped-db-2',
      },
    ]);
  });
});
