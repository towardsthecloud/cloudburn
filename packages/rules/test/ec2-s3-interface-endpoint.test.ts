import { describe, expect, it } from 'vitest';
import { ec2S3InterfaceEndpointRule } from '../src/aws/ec2/s3-interface-endpoint.js';
import type { IaCResource } from '../src/index.js';

const createTerraformVpcEndpoint = (overrides: Partial<IaCResource> = {}): IaCResource => ({
  provider: 'aws',
  type: 'aws_vpc_endpoint',
  name: 's3_private_link',
  location: {
    path: 'main.tf',
    startLine: 1,
    startColumn: 1,
  },
  attributeLocations: {
    service_name: {
      path: 'main.tf',
      startLine: 3,
      startColumn: 3,
    },
    vpc_endpoint_type: {
      path: 'main.tf',
      startLine: 4,
      startColumn: 3,
    },
  },
  attributes: {
    service_name: 'com.amazonaws.us-east-1.s3',
    vpc_endpoint_type: 'Interface',
  },
  ...overrides,
});

const createCloudFormationVpcEndpoint = (overrides: Partial<IaCResource> = {}): IaCResource => ({
  provider: 'aws',
  type: 'AWS::EC2::VPCEndpoint',
  name: 'S3Endpoint',
  location: {
    path: 'template.yaml',
    startLine: 4,
    startColumn: 3,
  },
  attributeLocations: {
    'Properties.ServiceName': {
      path: 'template.yaml',
      startLine: 6,
      startColumn: 7,
    },
    'Properties.VpcEndpointType': {
      path: 'template.yaml',
      startLine: 7,
      startColumn: 7,
    },
  },
  attributes: {
    Properties: {
      ServiceName: 'com.amazonaws.us-east-1.s3',
      VpcEndpointType: 'Interface',
    },
  },
  ...overrides,
});

describe('ec2S3InterfaceEndpointRule', () => {
  it('flags Terraform S3 interface endpoints', () => {
    const finding = ec2S3InterfaceEndpointRule.evaluateStatic?.({
      iacResources: [createTerraformVpcEndpoint()],
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EC2-2',
      service: 'ec2',
      source: 'iac',
      message: 'S3 access inside a VPC should prefer gateway endpoints over interface endpoints when possible.',
      findings: [
        {
          resourceId: 'aws_vpc_endpoint.s3_private_link',
          location: {
            path: 'main.tf',
            startLine: 4,
            startColumn: 3,
          },
        },
      ],
    });
  });

  it('flags CloudFormation S3 interface endpoints', () => {
    const finding = ec2S3InterfaceEndpointRule.evaluateStatic?.({
      iacResources: [createCloudFormationVpcEndpoint()],
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EC2-2',
      service: 'ec2',
      source: 'iac',
      message: 'S3 access inside a VPC should prefer gateway endpoints over interface endpoints when possible.',
      findings: [
        {
          resourceId: 'S3Endpoint',
          location: {
            path: 'template.yaml',
            startLine: 7,
            startColumn: 7,
          },
        },
      ],
    });
  });

  it('passes Terraform S3 gateway endpoints', () => {
    const finding = ec2S3InterfaceEndpointRule.evaluateStatic?.({
      iacResources: [
        createTerraformVpcEndpoint({
          attributes: {
            service_name: 'com.amazonaws.us-east-1.s3',
            vpc_endpoint_type: 'Gateway',
          },
        }),
      ],
    });

    expect(finding).toBeNull();
  });

  it('passes Terraform endpoints when the endpoint type is omitted', () => {
    const finding = ec2S3InterfaceEndpointRule.evaluateStatic?.({
      iacResources: [
        createTerraformVpcEndpoint({
          attributeLocations: {
            service_name: {
              path: 'main.tf',
              startLine: 3,
              startColumn: 3,
            },
          },
          attributes: {
            service_name: 'com.amazonaws.us-east-1.s3',
          },
        }),
      ],
    });

    expect(finding).toBeNull();
  });

  it('passes non-S3 interface endpoints', () => {
    const finding = ec2S3InterfaceEndpointRule.evaluateStatic?.({
      iacResources: [
        createTerraformVpcEndpoint({
          attributes: {
            service_name: 'com.amazonaws.us-east-1.ec2',
            vpc_endpoint_type: 'Interface',
          },
        }),
      ],
    });

    expect(finding).toBeNull();
  });

  it('skips endpoints with computed service names', () => {
    const finding = ec2S3InterfaceEndpointRule.evaluateStatic?.({
      iacResources: [
        createTerraformVpcEndpoint({
          attributes: {
            service_name: '${' + 'var.endpoint_service_name}',
            vpc_endpoint_type: 'Interface',
          },
        }),
      ],
    });

    expect(finding).toBeNull();
  });
});
