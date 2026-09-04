import { describe, expect, it } from 'vitest';
import { ec2IdleTransitGatewayVpcAttachmentRule } from '../src/aws/ec2/idle-transit-gateway-vpc-attachment.js';
import type { AwsEc2TransitGatewayVpcAttachmentActivity } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createAttachment = (
  overrides: Partial<AwsEc2TransitGatewayVpcAttachmentActivity> = {},
): AwsEc2TransitGatewayVpcAttachmentActivity => ({
  accountId: '123456789012',
  bytesInLast30Days: 0,
  bytesOutLast30Days: 0,
  estimatedMonthlyAttachmentCostUsd: 36.5,
  hourlyAttachmentCostUsd: 0.05,
  lookbackDays: 30,
  region: 'us-east-1',
  state: 'available',
  transitGatewayAttachmentId: 'tgw-attach-123',
  transitGatewayId: 'tgw-123',
  vpcId: 'vpc-123',
  ...overrides,
});

const evaluate = (attachment: AwsEc2TransitGatewayVpcAttachmentActivity) =>
  ec2IdleTransitGatewayVpcAttachmentRule.evaluateLive?.({
    catalog: {
      indexType: 'LOCAL',
      resources: [],
      searchRegion: 'us-east-1',
    },
    resources: new LiveResourceBag({
      'aws-ec2-transit-gateway-vpc-attachment-activity': [attachment],
    }),
  });

describe('ec2IdleTransitGatewayVpcAttachmentRule', () => {
  it('flags available VPC attachments when both traffic totals stay at zero for 30 days', () => {
    expect(evaluate(createAttachment())).toEqual({
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'tgw-attach-123',
        },
      ],
      message: 'Transit Gateway VPC attachments should process traffic or be removed.',
      ruleId: 'CLDBRN-AWS-EC2-14',
      service: 'ec2',
      severity: 'high',
      source: 'discovery',
    });
  });

  it('skips attachments when either traffic direction has activity', () => {
    expect(evaluate(createAttachment({ bytesOutLast30Days: 128 }))).toBeNull();
  });

  it('skips attachments when either metric has incomplete coverage', () => {
    expect(evaluate(createAttachment({ bytesInLast30Days: null }))).toBeNull();
    expect(evaluate(createAttachment({ bytesOutLast30Days: null }))).toBeNull();
  });

  it('skips attachments that are not available', () => {
    expect(evaluate(createAttachment({ state: 'pending' }))).toBeNull();
  });
});
