import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EC2-14';
const RULE_SERVICE = 'ec2';
const RULE_SEVERITY = 'high' as const;
const RULE_MESSAGE = 'Transit Gateway VPC attachments should process traffic or be removed.';

/** Flag available Transit Gateway VPC attachments with no traffic during a complete 30-day window. */
export const ec2IdleTransitGatewayVpcAttachmentRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'Transit Gateway VPC Attachment Idle',
  description:
    'Flag available Transit Gateway VPC attachments whose complete 30-day inbound and outbound traffic totals are both zero.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ec2-transit-gateway-vpc-attachment-activity'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ec2-transit-gateway-vpc-attachment-activity')
      .filter(
        (attachment) =>
          attachment.state === 'available' && attachment.bytesInLast30Days === 0 && attachment.bytesOutLast30Days === 0,
      )
      .map((attachment) =>
        createFindingMatch(attachment.transitGatewayAttachmentId, attachment.region, attachment.accountId),
      );

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
