import { describe, expect, it } from 'vitest';
import { ec2IdleNatGatewayRule } from '../src/aws/ec2/idle-nat-gateway.js';
import type { AwsEc2NatGatewayActivity } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createNatGateway = (overrides: Partial<AwsEc2NatGatewayActivity> = {}): AwsEc2NatGatewayActivity => ({
  accountId: '123456789012',
  bytesInFromDestinationLast7Days: 0,
  bytesOutToDestinationLast7Days: 0,
  natGatewayId: 'nat-123',
  region: 'us-east-1',
  state: 'available',
  subnetId: 'subnet-123',
  ...overrides,
});

describe('ec2IdleNatGatewayRule', () => {
  it('flags available NAT gateways when both inbound and outbound traffic stay at zero for 7 days', () => {
    const finding = ec2IdleNatGatewayRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-nat-gateway-activity': [createNatGateway()],
      }),
    });

    expect(finding).toEqual({
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'nat-123',
        },
      ],
      message: 'NAT gateways should process traffic or be removed.',
      ruleId: 'CLDBRN-AWS-EC2-10',
      service: 'ec2',
      source: 'discovery',
    });
  });

  it('skips NAT gateways when either traffic direction has activity', () => {
    const finding = ec2IdleNatGatewayRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-nat-gateway-activity': [createNatGateway({ bytesOutToDestinationLast7Days: 128 })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips NAT gateways when CloudWatch coverage is incomplete', () => {
    const finding = ec2IdleNatGatewayRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-nat-gateway-activity': [createNatGateway({ bytesInFromDestinationLast7Days: null })],
      }),
    });

    expect(finding).toBeNull();
  });
});
