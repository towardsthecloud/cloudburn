import { describe, expect, it } from 'vitest';
import { ec2PreferredInstanceTypeRule } from '../src/aws/ec2/preferred-instance-types.js';
import type { AwsDiscoveredResource, AwsEc2Instance, AwsStaticEc2Instance } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const createEc2Instance = (overrides: Partial<AwsEc2Instance> = {}): AwsEc2Instance => ({
  instanceId: 'i-1234567890abcdef0',
  instanceType: 'm4.large',
  region: 'us-east-1',
  accountId: '123456789012',
  ...overrides,
});

const createDiscoveredResource = (overrides: Partial<AwsDiscoveredResource> = {}): AwsDiscoveredResource => ({
  arn: 'arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890abcdef0',
  accountId: '123456789012',
  region: 'us-east-1',
  service: 'ec2',
  resourceType: 'ec2:instance',
  properties: [],
  ...overrides,
});

const createStaticInstance = (overrides: Partial<AwsStaticEc2Instance> = {}): AwsStaticEc2Instance => ({
  instanceType: 'm4.large',
  location: {
    path: 'main.tf',
    line: 4,
    column: 3,
  },
  resourceId: 'aws_instance.legacy_web',
  ...overrides,
});

describe('ec2PreferredInstanceTypeRule', () => {
  it('declares the live discovery metadata for direct EC2 instances', () => {
    expect(ec2PreferredInstanceTypeRule.discoveryDependencies).toEqual(['aws-ec2-instances']);
    expect(ec2PreferredInstanceTypeRule.staticDependencies).toEqual(['aws-ec2-instances']);
  });

  it('flags non-preferred EC2 instances in discovery mode', () => {
    const finding = ec2PreferredInstanceTypeRule.evaluateLive?.({
      catalog: {
        resources: [createDiscoveredResource()],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ec2-instances': [createEc2Instance()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EC2-1',
      service: 'ec2',
      source: 'discovery',
      message: 'EC2 instances should use preferred instance types.',
      findings: [
        {
          resourceId: 'i-1234567890abcdef0',
          region: 'us-east-1',
          accountId: '123456789012',
        },
      ],
    });
  });

  it('flags non-preferred Terraform aws_instance resources', () => {
    const finding = ec2PreferredInstanceTypeRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ec2-instances': [createStaticInstance()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EC2-1',
      service: 'ec2',
      source: 'iac',
      message: 'EC2 instances should use preferred instance types.',
      findings: [
        {
          resourceId: 'aws_instance.legacy_web',
          location: {
            path: 'main.tf',
            line: 4,
            column: 3,
          },
        },
      ],
    });
  });

  it('flags curated non-preferred Terraform aws_instance families such as c6i', () => {
    const finding = ec2PreferredInstanceTypeRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ec2-instances': [
          createStaticInstance({
            instanceType: 'c6i.large',
            resourceId: 'aws_instance.compute_web',
          }),
        ],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EC2-1',
      service: 'ec2',
      source: 'iac',
      message: 'EC2 instances should use preferred instance types.',
      findings: [
        {
          resourceId: 'aws_instance.compute_web',
          location: {
            path: 'main.tf',
            line: 4,
            column: 3,
          },
        },
      ],
    });
  });

  it('flags curated non-preferred Terraform aws_instance families such as c7in', () => {
    const finding = ec2PreferredInstanceTypeRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ec2-instances': [
          createStaticInstance({
            instanceType: 'c7in.large',
            resourceId: 'aws_instance.network_web',
          }),
        ],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EC2-1',
      service: 'ec2',
      source: 'iac',
      message: 'EC2 instances should use preferred instance types.',
      findings: [
        {
          resourceId: 'aws_instance.network_web',
          location: {
            path: 'main.tf',
            line: 4,
            column: 3,
          },
        },
      ],
    });
  });

  it('flags curated non-preferred live families even when AWS still offers them', () => {
    const finding = ec2PreferredInstanceTypeRule.evaluateLive?.({
      catalog: {
        resources: [createDiscoveredResource()],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ec2-instances': [createEc2Instance({ instanceType: 'c6i.large' })],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EC2-1',
      service: 'ec2',
      source: 'discovery',
      message: 'EC2 instances should use preferred instance types.',
      findings: [
        {
          resourceId: 'i-1234567890abcdef0',
          region: 'us-east-1',
          accountId: '123456789012',
        },
      ],
    });
  });

  it('skips preferred EC2 instances in discovery mode', () => {
    const finding = ec2PreferredInstanceTypeRule.evaluateLive?.({
      catalog: {
        resources: [createDiscoveredResource()],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ec2-instances': [createEc2Instance({ instanceType: 'm8azn.large' })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('flags non-preferred CloudFormation AWS::EC2::Instance resources', () => {
    const finding = ec2PreferredInstanceTypeRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ec2-instances': [
          createStaticInstance({
            location: {
              path: 'template.yaml',
              line: 6,
              column: 7,
            },
            resourceId: 'LegacyWeb',
          }),
        ],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EC2-1',
      service: 'ec2',
      source: 'iac',
      message: 'EC2 instances should use preferred instance types.',
      findings: [
        {
          resourceId: 'LegacyWeb',
          location: {
            path: 'template.yaml',
            line: 6,
            column: 7,
          },
        },
      ],
    });
  });

  it('skips Terraform aws_instance resources when the instance type is computed', () => {
    const finding = ec2PreferredInstanceTypeRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ec2-instances': [
          createStaticInstance({
            instanceType: null,
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips CloudFormation AWS::EC2::Instance resources when the instance type is intrinsic', () => {
    const finding = ec2PreferredInstanceTypeRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ec2-instances': [
          createStaticInstance({
            instanceType: null,
            resourceId: 'LegacyWeb',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips unknown instance families in static mode', () => {
    const finding = ec2PreferredInstanceTypeRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ec2-instances': [
          createStaticInstance({
            instanceType: 'zz9.large',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
