import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ec2ReservedInstanceRecentlyExpiredRule } from '../src/aws/ec2/reserved-instance-recently-expired.js';
import type { AwsEc2ReservedInstance } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createReservedInstance = (overrides: Partial<AwsEc2ReservedInstance> = {}): AwsEc2ReservedInstance => ({
  accountId: '123456789012',
  endTime: '2025-12-15T00:00:00.000Z',
  instanceType: 'm6i.large',
  region: 'us-east-1',
  reservedInstancesId: 'abcd1234-ef56-7890-abcd-1234567890ab',
  state: 'retired',
  ...overrides,
});

describe('ec2ReservedInstanceRecentlyExpiredRule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flags reserved instances that expired within the last 30 days', () => {
    const finding = ec2ReservedInstanceRecentlyExpiredRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-reserved-instances': [createReservedInstance()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EC2-12',
      service: 'ec2',
      source: 'discovery',
      message: 'EC2 reserved instances that expired within the last 30 days should be reviewed.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'abcd1234-ef56-7890-abcd-1234567890ab',
        },
      ],
    });
  });

  it('skips reserved instances that expired outside the review window', () => {
    const finding = ec2ReservedInstanceRecentlyExpiredRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-reserved-instances': [
          createReservedInstance({
            endTime: '2025-11-15T00:00:00.000Z',
            reservedInstancesId: 'older-expired',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips reserved instances that have not expired yet', () => {
    const finding = ec2ReservedInstanceRecentlyExpiredRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-reserved-instances': [
          createReservedInstance({
            endTime: '2026-01-15T00:00:00.000Z',
            reservedInstancesId: 'future-expiry',
            state: 'active',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
