import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ec2LongRunningInstanceRule } from '../src/aws/ec2/long-running-instance.js';
import type { AwsEc2Instance } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createInstance = (overrides: Partial<AwsEc2Instance> = {}): AwsEc2Instance => ({
  accountId: '123456789012',
  instanceId: 'i-123',
  instanceType: 'm7i.large',
  launchTime: '2025-06-15T00:00:00.000Z',
  region: 'us-east-1',
  state: 'running',
  ...overrides,
});

describe('ec2LongRunningInstanceRule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flags instances running for 180 days or longer', () => {
    const finding = ec2LongRunningInstanceRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-instances': [createInstance()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EC2-9',
      service: 'ec2',
      source: 'discovery',
      message: 'EC2 instances running for 180 days or longer should be reviewed.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'i-123',
        },
      ],
    });
  });

  it('skips recently launched instances', () => {
    const finding = ec2LongRunningInstanceRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-instances': [createInstance({ launchTime: '2025-10-01T00:00:00.000Z' })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips instances without a launch timestamp', () => {
    const finding = ec2LongRunningInstanceRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-instances': [createInstance({ launchTime: undefined })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips old instances that are not currently running', () => {
    const finding = ec2LongRunningInstanceRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-instances': [createInstance({ state: 'stopped' })],
      }),
    });

    expect(finding).toBeNull();
  });
});
