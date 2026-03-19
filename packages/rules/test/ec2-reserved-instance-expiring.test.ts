import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ec2ReservedInstanceExpiringRule } from '../src/aws/ec2/reserved-instance-expiring.js';
import type { AwsEc2ReservedInstance } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createReservedInstance = (overrides: Partial<AwsEc2ReservedInstance> = {}): AwsEc2ReservedInstance => ({
  accountId: '123456789012',
  endTime: '2026-02-15T00:00:00.000Z',
  instanceType: 'm6i.large',
  region: 'us-east-1',
  reservedInstancesId: 'abcd1234-ef56-7890-abcd-1234567890ab',
  state: 'active',
  ...overrides,
});

describe('ec2ReservedInstanceExpiringRule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flags active reserved instances expiring within the review window', () => {
    const finding = ec2ReservedInstanceExpiringRule.evaluateLive?.({
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
      ruleId: 'CLDBRN-AWS-EC2-7',
      service: 'ec2',
      source: 'discovery',
      message: 'EC2 reserved instances expiring within 60 days should be reviewed.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'abcd1234-ef56-7890-abcd-1234567890ab',
        },
      ],
    });
  });

  it('skips reserved instances outside the review window', () => {
    const finding = ec2ReservedInstanceExpiringRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-reserved-instances': [createReservedInstance({ endTime: '2026-04-15T00:00:00.000Z' })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips reserved instances that are not active or already expired', () => {
    const finding = ec2ReservedInstanceExpiringRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-reserved-instances': [
          createReservedInstance({ reservedInstancesId: 'expired', endTime: '2025-12-30T00:00:00.000Z' }),
          createReservedInstance({ reservedInstancesId: 'retired', state: 'retired' }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
