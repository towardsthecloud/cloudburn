import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ec2StoppedInstanceRule } from '../src/aws/ec2/stopped-instance.js';
import type { AwsEc2Instance } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createInstance = (overrides: Partial<AwsEc2Instance> = {}): AwsEc2Instance => ({
  accountId: '123456789012',
  architecture: 'x86_64',
  instanceId: 'i-stopped-old',
  instanceType: 'm7i.large',
  launchTime: '2025-01-01T00:00:00.000Z',
  region: 'us-east-1',
  state: 'stopped',
  stoppedAt: '2025-11-15T00:00:00.000Z',
  ...overrides,
});

describe('ec2StoppedInstanceRule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flags stopped instances whose parsed stop time is at least 30 days old', () => {
    const finding = ec2StoppedInstanceRule.evaluateLive?.({
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
      ruleId: 'CLDBRN-AWS-EC2-13',
      service: 'ec2',
      source: 'discovery',
      message: 'Stopped EC2 instances with a parsed stop time older than 30 days should be reviewed for cleanup.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'i-stopped-old',
        },
      ],
    });
  });

  it('skips instances that are not currently stopped or are stopped recently', () => {
    const finding = ec2StoppedInstanceRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-instances': [
          createInstance({
            instanceId: 'i-running',
            state: 'running',
          }),
          createInstance({
            instanceId: 'i-stopped-recently',
            stoppedAt: '2025-12-20T00:00:00.000Z',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips stopped instances whose stop time could not be parsed', () => {
    const finding = ec2StoppedInstanceRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-instances': [
          createInstance({
            instanceId: 'i-stopped-unknown-time',
            stoppedAt: undefined,
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
