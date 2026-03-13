import { describe, expect, it } from 'vitest';
import { ec2LowUtilizationRule } from '../src/aws/ec2/low-utilization.js';
import type { AwsEc2InstanceUtilization } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createInstance = (overrides: Partial<AwsEc2InstanceUtilization> = {}): AwsEc2InstanceUtilization => ({
  accountId: '123456789012',
  averageCpuUtilizationLast14Days: 4.2,
  averageDailyNetworkBytesLast14Days: 1024,
  instanceId: 'i-123',
  instanceType: 'm6i.large',
  lowUtilizationDays: 4,
  region: 'us-east-1',
  ...overrides,
});

describe('ec2LowUtilizationRule', () => {
  it('flags low-utilization instances in discovery mode', () => {
    const finding = ec2LowUtilizationRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-instance-utilization': [createInstance()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EC2-5',
      service: 'ec2',
      source: 'discovery',
      message: 'EC2 instances should not remain low utilization for 4 or more of the previous 14 days.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'i-123',
        },
      ],
    });
  });

  it('skips instances below the low-utilization day threshold', () => {
    const finding = ec2LowUtilizationRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-instance-utilization': [createInstance({ lowUtilizationDays: 3 })],
      }),
    });

    expect(finding).toBeNull();
  });
});
