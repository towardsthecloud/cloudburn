import { describe, expect, it } from 'vitest';
import { ec2GravitonReviewRule } from '../src/aws/ec2/graviton-review.js';
import type { AwsEc2Instance } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createInstance = (overrides: Partial<AwsEc2Instance> = {}): AwsEc2Instance => ({
  accountId: '123456789012',
  architecture: 'x86_64',
  instanceId: 'i-123',
  instanceType: 'm7i.large',
  region: 'us-east-1',
  ...overrides,
});

describe('ec2GravitonReviewRule', () => {
  it('flags non-Graviton instances with a clear Arm equivalent', () => {
    const finding = ec2GravitonReviewRule.evaluateLive?.({
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
      message: 'EC2 instances without a Graviton equivalent in use should be reviewed.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'i-123',
        },
      ],
    });
  });

  it('skips instances that already run on Graviton', () => {
    const finding = ec2GravitonReviewRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-instances': [createInstance({ architecture: 'arm64', instanceType: 'm7g.large' })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips families outside the curated equivalent set', () => {
    const finding = ec2GravitonReviewRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-instances': [createInstance({ instanceType: 'u-12tb1.metal' })],
      }),
    });

    expect(finding).toBeNull();
  });
});
