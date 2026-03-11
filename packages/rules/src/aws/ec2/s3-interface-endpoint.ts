import { createFinding, createRule, createStaticFindingMatch, isRecord } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EC2-2';
const RULE_SERVICE = 'ec2';
const RULE_MESSAGE = 'S3 access inside a VPC should prefer gateway endpoints over interface endpoints when possible.';
const TERRAFORM_VPC_ENDPOINT_TYPE = 'aws_vpc_endpoint';
const CLOUDFORMATION_VPC_ENDPOINT_TYPE = 'AWS::EC2::VPCEndpoint';

const getLiteralString = (value: unknown): string | null =>
  typeof value === 'string' && !value.includes('${') ? value : null;

const isS3ServiceName = (value: unknown): boolean => {
  const literal = getLiteralString(value);

  return literal?.toLowerCase().endsWith('.s3') ?? false;
};

const isInterfaceEndpointType = (value: unknown): boolean => {
  const literal = getLiteralString(value);

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
  evaluateStatic: ({ iacResources }) => {
    const findings = iacResources.flatMap((resource) => {
      if (resource.provider !== 'aws') {
        return [];
      }

      if (
        resource.type === TERRAFORM_VPC_ENDPOINT_TYPE &&
        isS3ServiceName(resource.attributes.service_name) &&
        isInterfaceEndpointType(resource.attributes.vpc_endpoint_type)
      ) {
        return [
          createStaticFindingMatch(resource, `${resource.type}.${resource.name}`, [
            'vpc_endpoint_type',
            'service_name',
          ]),
        ];
      }

      const properties = isRecord(resource.attributes.Properties) ? resource.attributes.Properties : undefined;

      if (
        resource.type === CLOUDFORMATION_VPC_ENDPOINT_TYPE &&
        properties &&
        isS3ServiceName(properties.ServiceName) &&
        isInterfaceEndpointType(properties.VpcEndpointType)
      ) {
        return [
          createStaticFindingMatch(resource, resource.name, ['Properties.VpcEndpointType', 'Properties.ServiceName']),
        ];
      }

      return [];
    });

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
