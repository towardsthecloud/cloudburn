import { describe, expect, it } from 'vitest';
import { ec2LargeInstanceRule } from '../src/aws/ec2/large-instance.js';
import type { AwsEc2Instance } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createInstance = (overrides: Partial<AwsEc2Instance> = {}): AwsEc2Instance => ({
  accountId: '123456789012',
  instanceId: 'i-123',
  instanceType: 'm7i.2xlarge',
  region: 'us-east-1',
  ...overrides,
});

describe('ec2LargeInstanceRule', () => {
  it('flags instances sized at 2xlarge and above', () => {
    const finding = ec2LargeInstanceRule.evaluateLive?.({
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
      ruleId: 'CLDBRN-AWS-EC2-8',
      service: 'ec2',
      source: 'discovery',
      message: 'EC2 large instances of 2xlarge or greater should be reviewed.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'i-123',
        },
      ],
    });
  });

  it('skips instances below the large-instance threshold', () => {
    const finding = ec2LargeInstanceRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-instances': [createInstance({ instanceType: 'm7i.xlarge' })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('treats metal sizes as large-instance candidates', () => {
    const finding = ec2LargeInstanceRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-instances': [createInstance({ instanceType: 'c7i.metal' })],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        resourceId: 'i-123',
      },
    ]);
  });
});
