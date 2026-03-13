import { describe, expect, it } from 'vitest';
import { ec2InactiveVpcInterfaceEndpointRule } from '../src/aws/ec2/inactive-vpc-interface-endpoint.js';
import type { AwsEc2VpcEndpointActivity } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createVpcEndpoint = (overrides: Partial<AwsEc2VpcEndpointActivity> = {}): AwsEc2VpcEndpointActivity => ({
  accountId: '123456789012',
  bytesProcessedLast30Days: 0,
  region: 'us-east-1',
  serviceName: 'com.amazonaws.us-east-1.logs',
  subnetIds: ['subnet-123'],
  vpcEndpointId: 'vpce-123',
  vpcEndpointType: 'interface',
  vpcId: 'vpc-123',
  ...overrides,
});

describe('ec2InactiveVpcInterfaceEndpointRule', () => {
  it('flags inactive interface endpoints in discovery mode', () => {
    const finding = ec2InactiveVpcInterfaceEndpointRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-vpc-endpoint-activity': [createVpcEndpoint()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EC2-4',
      service: 'ec2',
      source: 'discovery',
      message: 'Interface VPC endpoints should process traffic or be removed.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'vpce-123',
        },
      ],
    });
  });

  it('skips active interface endpoints in discovery mode', () => {
    const finding = ec2InactiveVpcInterfaceEndpointRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-vpc-endpoint-activity': [createVpcEndpoint({ bytesProcessedLast30Days: 512 })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips interface endpoints when traffic coverage is unknown', () => {
    const finding = ec2InactiveVpcInterfaceEndpointRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-vpc-endpoint-activity': [createVpcEndpoint({ bytesProcessedLast30Days: null })],
      }),
    });

    expect(finding).toBeNull();
  });
});
