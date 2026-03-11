import { describe, expect, it } from 'vitest';
import { ec2S3InterfaceEndpointRule } from '../src/aws/ec2/s3-interface-endpoint.js';
import type { AwsStaticEc2VpcEndpoint } from '../src/index.js';
import { StaticResourceBag } from '../src/index.js';

const createVpcEndpoint = (overrides: Partial<AwsStaticEc2VpcEndpoint> = {}): AwsStaticEc2VpcEndpoint => ({
  location: {
    path: 'main.tf',
    startLine: 4,
    startColumn: 3,
  },
  resourceId: 'aws_vpc_endpoint.s3_private_link',
  serviceName: 'com.amazonaws.us-east-1.s3',
  vpcEndpointType: 'interface',
  ...overrides,
});

describe('ec2S3InterfaceEndpointRule', () => {
  it('flags Terraform S3 interface endpoints', () => {
    const finding = ec2S3InterfaceEndpointRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ec2-vpc-endpoints': [createVpcEndpoint()],
      }),
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
      resources: new StaticResourceBag({
        'aws-ec2-vpc-endpoints': [
          createVpcEndpoint({
            location: {
              path: 'template.yaml',
              startLine: 7,
              startColumn: 7,
            },
            resourceId: 'S3Endpoint',
          }),
        ],
      }),
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
      resources: new StaticResourceBag({
        'aws-ec2-vpc-endpoints': [
          createVpcEndpoint({
            vpcEndpointType: 'gateway',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('passes Terraform endpoints when the endpoint type is omitted', () => {
    const finding = ec2S3InterfaceEndpointRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ec2-vpc-endpoints': [
          createVpcEndpoint({
            vpcEndpointType: null,
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('passes non-S3 interface endpoints', () => {
    const finding = ec2S3InterfaceEndpointRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ec2-vpc-endpoints': [
          createVpcEndpoint({
            serviceName: 'com.amazonaws.us-east-1.ec2',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips endpoints with computed service names', () => {
    const finding = ec2S3InterfaceEndpointRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ec2-vpc-endpoints': [
          createVpcEndpoint({
            serviceName: null,
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
