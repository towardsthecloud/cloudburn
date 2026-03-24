import { describe, expect, it } from 'vitest';
import { rdsReservedCoverageRule } from '../src/aws/rds/reserved-coverage.js';
import type { AwsRdsInstance, AwsRdsReservedInstance } from '../src/index.js';
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

const createReservedInstance = (overrides: Partial<AwsRdsReservedInstance> = {}): AwsRdsReservedInstance => ({
  accountId: '123456789012',
  instanceClass: 'db.m6i.large',
  instanceCount: 1,
  multiAz: false,
  productDescription: 'mysql',
  region: 'us-east-1',
  reservedDbInstanceId: 'ri-123',
  state: 'active',
  ...overrides,
});

describe('rdsReservedCoverageRule', () => {
  it('flags long-running RDS instances without active reserved coverage', () => {
    const finding = rdsReservedCoverageRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance()],
        'aws-rds-reserved-instances': [],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-RDS-3',
      service: 'rds',
      source: 'discovery',
      message: 'Long-running RDS DB instances should have reserved instance coverage.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'prod-db',
        },
      ],
    });
  });

  it('skips long-running RDS instances when matching active reserved coverage exists', () => {
    const finding = rdsReservedCoverageRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance()],
        'aws-rds-reserved-instances': [createReservedInstance()],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips instances that are not yet long-running', () => {
    const finding = rdsReservedCoverageRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance({ instanceCreateTime: '2026-02-20T00:00:00.000Z' })],
        'aws-rds-reserved-instances': [],
      }),
    });

    expect(finding).toBeNull();
  });

  it('does not consume reserved coverage from a different account', () => {
    const finding = rdsReservedCoverageRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance()],
        'aws-rds-reserved-instances': [createReservedInstance({ accountId: '210987654321' })],
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
});
