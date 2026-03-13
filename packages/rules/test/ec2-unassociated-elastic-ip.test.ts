import { describe, expect, it } from 'vitest';
import { ec2UnassociatedElasticIpRule } from '../src/aws/ec2/unassociated-elastic-ip.js';
import type { AwsEc2ElasticIp } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createElasticIp = (overrides: Partial<AwsEc2ElasticIp> = {}): AwsEc2ElasticIp => ({
  accountId: '123456789012',
  allocationId: 'eipalloc-123',
  publicIp: '203.0.113.10',
  region: 'us-east-1',
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
});
