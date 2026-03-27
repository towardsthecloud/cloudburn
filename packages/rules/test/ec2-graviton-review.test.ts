import { describe, expect, it } from 'vitest';
import { ec2GravitonReviewRule } from '../src/aws/ec2/graviton-review.js';
import type { AwsEc2Instance, AwsStaticEc2Instance } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const createInstance = (overrides: Partial<AwsEc2Instance> = {}): AwsEc2Instance => ({
  accountId: '123456789012',
  architecture: 'x86_64',
  instanceId: 'i-123',
  instanceType: 'm7i.large',
  region: 'us-east-1',
  ...overrides,
});

const createStaticInstance = (overrides: Partial<AwsStaticEc2Instance> = {}): AwsStaticEc2Instance => ({
  resourceId: 'aws_instance.app',
  instanceType: 'm7i.large',
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
      ruleId: 'CLDBRN-AWS-EC2-6',
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

  it('flags static instances with a clear Arm equivalent from the instance family alone', () => {
    const finding = ec2GravitonReviewRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ec2-instances': [createStaticInstance()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EC2-6',
      service: 'ec2',
      source: 'iac',
      message: 'EC2 instances without a Graviton equivalent in use should be reviewed.',
      findings: [
        {
          resourceId: 'aws_instance.app',
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

  it('skips static Graviton or unclassified instance families', () => {
    const gravitonFinding = ec2GravitonReviewRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ec2-instances': [createStaticInstance({ instanceType: 'm7g.large' })],
      }),
    });
    const unclassifiedFinding = ec2GravitonReviewRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ec2-instances': [createStaticInstance({ instanceType: 'u-12tb1.metal' })],
      }),
    });

    expect(gravitonFinding).toBeNull();
    expect(unclassifiedFinding).toBeNull();
  });
});
