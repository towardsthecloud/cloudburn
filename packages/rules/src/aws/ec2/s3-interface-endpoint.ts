import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EC2-2';
const RULE_SERVICE = 'ec2';
const RULE_MESSAGE = 'S3 access inside a VPC should prefer gateway endpoints over interface endpoints when possible.';

const isS3ServiceName = (value: unknown): boolean => {
  const literal = typeof value === 'string' ? value : null;

  return literal?.toLowerCase().endsWith('.s3') ?? false;
};

const isInterfaceEndpointType = (value: unknown): boolean => {
  const literal = typeof value === 'string' ? value : null;

  return literal?.toLowerCase() === 'interface';
};

/** Flag S3 interface endpoints, which are usually a more expensive choice than gateway endpoints inside a VPC. */
export const ec2S3InterfaceEndpointRule = createRule({
  id: RULE_ID,
  name: 'S3 Interface VPC Endpoint Used',
  description: 'Flag S3 interface endpoints when a gateway endpoint is the cheaper in-VPC option.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['iac'],
  staticDependencies: ['aws-ec2-vpc-endpoints'],
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-ec2-vpc-endpoints')
      .filter((endpoint) => isS3ServiceName(endpoint.serviceName) && isInterfaceEndpointType(endpoint.vpcEndpointType))
      .map((endpoint) => createFindingMatch(endpoint.resourceId, undefined, undefined, endpoint.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
