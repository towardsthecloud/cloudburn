import { createFinding, createFindingMatch, createLiveEvaluationCoverage, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EC2-11';
const RULE_SERVICE = 'ec2';
const RULE_SEVERITY = 'high' as const;
const RULE_MESSAGE = 'NAT gateways should process traffic or be removed.';

/** Flag available NAT gateways that have processed no traffic in either direction for 7 days. */
export const ec2IdleNatGatewayRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'NAT Gateway Idle',
  description: 'Flag available NAT gateways whose inbound and outbound traffic both stay at zero for 7 days.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ec2-nat-gateway-activity'],
  getLiveEvaluationCoverage: ({ resources }) =>
    createLiveEvaluationCoverage(
      resources.get('aws-ec2-nat-gateway-activity'),
      (gateway) =>
        gateway.state !== 'available' ||
        (gateway.bytesInFromDestinationLast7Days != null && gateway.bytesOutToDestinationLast7Days != null),
      (gateway) => createFindingMatch(gateway.natGatewayId, gateway.region, gateway.accountId),
    ),
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ec2-nat-gateway-activity')
      .filter(
        (natGateway) =>
          natGateway.state === 'available' &&
          natGateway.bytesInFromDestinationLast7Days === 0 &&
          natGateway.bytesOutToDestinationLast7Days === 0,
      )
      .map((natGateway) => createFindingMatch(natGateway.natGatewayId, natGateway.region, natGateway.accountId));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
