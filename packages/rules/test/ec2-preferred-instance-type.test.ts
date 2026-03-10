import { describe, expect, it } from 'vitest';
import { ec2PreferredInstanceTypeRule } from '../src/aws/ec2/preferred-instance-types.js';
import type { AwsDiscoveredResource, AwsEc2Instance, IaCResource, StaticEvaluationContext } from '../src/index.js';

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

const createTerraformResource = (overrides: Partial<IaCResource> = {}): IaCResource => ({
  provider: 'aws',
  type: 'aws_instance',
  name: 'legacy_web',
  location: {
    path: 'main.tf',
    startLine: 1,
    startColumn: 1,
  },
  attributeLocations: {
    instance_type: {
      path: 'main.tf',
      startLine: 4,
      startColumn: 3,
    },
  },
  attributes: {
    instance_type: 'm4.large',
  },
  ...overrides,
});

const createCloudFormationResource = (overrides: Partial<IaCResource> = {}): IaCResource => ({
  provider: 'aws',
  type: 'AWS::EC2::Instance',
  name: 'LegacyWeb',
  location: {
    path: 'template.yaml',
    startLine: 3,
    startColumn: 3,
  },
  attributeLocations: {
    'Properties.InstanceType': {
      path: 'template.yaml',
      startLine: 6,
      startColumn: 7,
    },
  },
  attributes: {
    Properties: {
      InstanceType: 'm4.large',
    },
  },
  ...overrides,
});

describe('ec2PreferredInstanceTypeRule', () => {
  it('declares the live discovery metadata for direct EC2 instances', () => {
    expect(ec2PreferredInstanceTypeRule.liveDiscovery).toEqual({
      hydrator: 'aws-ec2-instance',
      resourceTypes: ['ec2:instance'],
    });
  });

  it('flags non-preferred EC2 instances in discovery mode', () => {
    const finding = ec2PreferredInstanceTypeRule.evaluateLive?.({
      catalog: {
        resources: [createDiscoveredResource()],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      ebsVolumes: [],
      lambdaFunctions: [],
      ec2Instances: [createEc2Instance()],
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
    const staticContext = {
      iacResources: [createTerraformResource()],
    } satisfies StaticEvaluationContext;

    const finding = ec2PreferredInstanceTypeRule.evaluateStatic?.(staticContext);

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
            startLine: 4,
            startColumn: 3,
          },
        },
      ],
    });
  });

  it('flags curated non-preferred Terraform aws_instance families such as c6i', () => {
    const finding = ec2PreferredInstanceTypeRule.evaluateStatic?.({
      iacResources: [
        createTerraformResource({
          name: 'compute_web',
          attributes: {
            instance_type: 'c6i.large',
          },
        }),
      ],
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
            startLine: 4,
            startColumn: 3,
          },
        },
      ],
    });
  });

  it('flags curated non-preferred Terraform aws_instance families such as c7in', () => {
    const finding = ec2PreferredInstanceTypeRule.evaluateStatic?.({
      iacResources: [
        createTerraformResource({
          name: 'network_web',
          attributes: {
            instance_type: 'c7in.large',
          },
        }),
      ],
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
            startLine: 4,
            startColumn: 3,
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
      ebsVolumes: [],
      lambdaFunctions: [],
      ec2Instances: [createEc2Instance({ instanceType: 'c6i.large' })],
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
      ebsVolumes: [],
      lambdaFunctions: [],
      ec2Instances: [createEc2Instance({ instanceType: 'm8azn.large' })],
    });

    expect(finding).toBeNull();
  });

  it('flags non-preferred CloudFormation AWS::EC2::Instance resources', () => {
    const finding = ec2PreferredInstanceTypeRule.evaluateStatic?.({
      iacResources: [createCloudFormationResource()],
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
            startLine: 6,
            startColumn: 7,
          },
        },
      ],
    });
  });

  it('skips Terraform aws_instance resources when the instance type is computed', () => {
    const finding = ec2PreferredInstanceTypeRule.evaluateStatic?.({
      iacResources: [
        createTerraformResource({
          attributes: {
            instance_type: '${' + 'var.instance_type}',
          },
        }),
      ],
    });

    expect(finding).toBeNull();
  });

  it('skips CloudFormation AWS::EC2::Instance resources when the instance type is intrinsic', () => {
    const finding = ec2PreferredInstanceTypeRule.evaluateStatic?.({
      iacResources: [
        createCloudFormationResource({
          attributes: {
            Properties: {
              InstanceType: {
                Ref: 'InstanceType',
              },
            },
          },
        }),
      ],
    });

    expect(finding).toBeNull();
  });

  it('skips unknown instance families in static mode', () => {
    const finding = ec2PreferredInstanceTypeRule.evaluateStatic?.({
      iacResources: [
        createTerraformResource({
          attributes: {
            instance_type: 'zz9.large',
          },
        }),
      ],
    });

    expect(finding).toBeNull();
  });
});
