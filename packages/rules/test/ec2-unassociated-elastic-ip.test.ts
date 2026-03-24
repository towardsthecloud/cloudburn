import { describe, expect, it } from 'vitest';
import { ec2UnassociatedElasticIpRule } from '../src/aws/ec2/unassociated-elastic-ip.js';
import type { AwsEc2ElasticIp, AwsStaticEc2ElasticIp } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const createElasticIp = (overrides: Partial<AwsEc2ElasticIp> = {}): AwsEc2ElasticIp => ({
  accountId: '123456789012',
  allocationId: 'eipalloc-123',
  publicIp: '203.0.113.10',
  region: 'us-east-1',
  ...overrides,
});

const createStaticElasticIp = (overrides: Partial<AwsStaticEc2ElasticIp> = {}): AwsStaticEc2ElasticIp => ({
  resourceId: 'aws_eip.public',
  isAssociated: false,
  ...overrides,
});

describe('ec2UnassociatedElasticIpRule', () => {
  it('flags unassociated elastic IPs in discovery mode', () => {
    const finding = ec2UnassociatedElasticIpRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-elastic-ips': [createElasticIp()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EC2-3',
      service: 'ec2',
      source: 'discovery',
      message: 'Elastic IP addresses should not remain unassociated.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'eipalloc-123',
        },
      ],
    });
  });

  it('skips associated elastic IPs in discovery mode', () => {
    const finding = ec2UnassociatedElasticIpRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-elastic-ips': [createElasticIp({ associationId: 'eipassoc-123', instanceId: 'i-123' })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('flags unassociated elastic IPs in static mode', () => {
    const finding = ec2UnassociatedElasticIpRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ec2-elastic-ips': [createStaticElasticIp()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EC2-3',
      service: 'ec2',
      source: 'iac',
      message: 'Elastic IP addresses should not remain unassociated.',
      findings: [
        {
          resourceId: 'aws_eip.public',
        },
      ],
    });
  });

  it('skips associated elastic IPs in static mode', () => {
    const finding = ec2UnassociatedElasticIpRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ec2-elastic-ips': [createStaticElasticIp({ isAssociated: true })],
      }),
    });

    expect(finding).toBeNull();
  });
});
