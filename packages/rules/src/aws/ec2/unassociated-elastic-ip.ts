import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EC2-3';
const RULE_SERVICE = 'ec2';
const RULE_MESSAGE = 'Elastic IP addresses should not remain unassociated.';

/** Flag Elastic IP allocations that are not associated with any resource. */
export const ec2UnassociatedElasticIpRule = createRule({
  id: RULE_ID,
  name: 'Elastic IP Address Unassociated',
  description: 'Flag Elastic IP allocations that are not associated with an EC2 resource.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery', 'iac'],
  discoveryDependencies: ['aws-ec2-elastic-ips'],
  staticDependencies: ['aws-ec2-elastic-ips'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ec2-elastic-ips')
      .filter((address) => !address.associationId && !address.instanceId && !address.networkInterfaceId)
      .map((address) => createFindingMatch(address.allocationId, address.region, address.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-ec2-elastic-ips')
      .filter((address) => !address.isAssociated)
      .map((address) => createFindingMatch(address.resourceId, undefined, undefined, address.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
