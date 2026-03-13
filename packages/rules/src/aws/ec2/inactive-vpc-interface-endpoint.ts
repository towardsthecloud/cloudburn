import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EC2-4';
const RULE_SERVICE = 'ec2';
const RULE_MESSAGE = 'Interface VPC endpoints should process traffic or be removed.';

/** Flag interface VPC endpoints that have processed no traffic in the last 30 days. */
export const ec2InactiveVpcInterfaceEndpointRule = createRule({
  id: RULE_ID,
  name: 'VPC Interface Endpoint Inactive',
  description: 'Flag interface VPC endpoints that have processed no traffic in the last 30 days.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ec2-vpc-endpoint-activity'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ec2-vpc-endpoint-activity')
      .filter((endpoint) => endpoint.bytesProcessedLast30Days === 0)
      .map((endpoint) => createFindingMatch(endpoint.vpcEndpointId, endpoint.region, endpoint.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
