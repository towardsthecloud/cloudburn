import {
  DescribeDhcpOptionsCommand,
  DescribeNetworkAclsCommand,
  DescribeSecurityGroupRulesCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
} from '@aws-sdk/client-ec2';
import { DescribeKeyCommand } from '@aws-sdk/client-kms';
import { DescribeAssociationCommand } from '@aws-sdk/client-ssm';
import type { AwsDiscoveredResource, AwsUntaggedResource } from '@cloudburn/rules';
import { createEc2Client, createKmsClient, createSsmClient } from '../client.js';
import type { AwsDiscoveryDatasetLoadContext } from '../discovery-registry.js';
import { getAwsErrorCode, isAwsAccessDeniedError } from '../errors.js';
import { chunkItems, mapWithConcurrency, withAwsServiceErrorContext } from './utils.js';

const UNTAGGED_RESOURCES_FILTER = 'resourcetype.supports:tags tag:none';
const EC2_RESOURCE_NOT_FOUND_CODES = new Set([
  'InvalidVpcID.NotFound',
  'InvalidSubnetID.NotFound',
  'InvalidGroup.NotFound',
  'InvalidNetworkAclID.NotFound',
  'InvalidSecurityGroupRuleId.NotFound',
  'InvalidDhcpOptionID.NotFound',
]);
const INSPECTOR_ASSOCIATION_NAMES = new Set([
  'InspectorInventoryCollection-do-not-delete',
  'InspectorDistributor-do-not-delete',
  'InvokeInspectorSsmPlugin-do-not-delete',
  'InspectorLinuxDistributor-do-not-delete',
  'InvokeInspectorLinuxSsmPlugin-do-not-delete',
]);
type CreationOrigin = 'aws' | 'user' | 'unknown';

type OriginPage = {
  resources: Array<{ id?: string; origin: CreationOrigin }>;
  nextToken?: string;
};

const defaultOrigin = (isDefault: boolean | undefined): CreationOrigin =>
  isDefault === true ? 'aws' : isDefault === false ? 'user' : 'unknown';

const loadEc2ResourceOrigins = async (
  resources: AwsDiscoveredResource[],
  region: string,
  origins: Map<string, CreationOrigin>,
): Promise<void> => {
  const client = createEc2Client({ region });
  const groupNames = new Map<string, string>();
  const describeGroups = async (ids: string[], nextToken?: string) => {
    const response = await withAwsServiceErrorContext('Amazon EC2', 'DescribeSecurityGroups', region, () =>
      client.send(new DescribeSecurityGroupsCommand({ GroupIds: ids, NextToken: nextToken })),
    );
    for (const group of response.SecurityGroups ?? []) {
      if (group.GroupId && group.GroupName) groupNames.set(group.GroupId, group.GroupName);
    }
    return response;
  };
  // Scope every request to catalog IDs. Paginate even ID-filtered descriptions,
  // leaving missing rows and denied metadata unknown rather than assuming ownership.
  const load = async (
    type: string,
    fetchPage: (ids: string[], nextToken?: string) => Promise<OriginPage>,
  ): Promise<void> => {
    const candidates = resources.filter((resource) => resource.resourceType === type);
    for (const candidate of candidates) origins.set(candidate.arn, 'unknown');
    for (const batch of chunkItems(candidates, 100)) {
      const arns = new Map(batch.map((resource) => [resource.arn.split('/').at(-1) as string, resource.arn]));
      const loadBatch = async (ids: string[]): Promise<void> => {
        let nextToken: string | undefined;
        try {
          do {
            const page = await fetchPage(ids, nextToken);
            for (const resource of page.resources) {
              const arn = resource.id ? arns.get(resource.id) : undefined;
              if (arn) origins.set(arn, resource.origin);
            }
            nextToken = page.nextToken;
          } while (nextToken);
        } catch (error) {
          if (isAwsAccessDeniedError(error)) return;
          if (!EC2_RESOURCE_NOT_FOUND_CODES.has(getAwsErrorCode(error) ?? '')) throw error;
          // A stale ID rejects the whole EC2 request. Split only failed batches
          // so valid resources can still be assessed and missing IDs stay unknown.
          if (ids.length > 1) {
            const middle = Math.ceil(ids.length / 2);
            await loadBatch(ids.slice(0, middle));
            await loadBatch(ids.slice(middle));
          }
        }
      };
      await loadBatch([...arns.keys()]);
    }
  };

  // Current attachments and main-table associations do not prove creation origin:
  // AWS-provided objects can be reassigned, just like customer-created objects.
  for (const resource of resources) {
    if (resource.resourceType === 'ec2:route-table' || resource.resourceType === 'ec2:internet-gateway')
      origins.set(resource.arn, 'unknown');
  }

  await load('ec2:vpc', async (ids, NextToken) => {
    const response = await withAwsServiceErrorContext('Amazon EC2', 'DescribeVpcs', region, () =>
      client.send(new DescribeVpcsCommand({ VpcIds: ids, NextToken })),
    );
    return {
      resources: (response.Vpcs ?? []).map((vpc) => ({ id: vpc.VpcId, origin: defaultOrigin(vpc.IsDefault) })),
      nextToken: response.NextToken,
    };
  });
  await load('ec2:dhcp-options', async (ids, NextToken) => {
    const response = await withAwsServiceErrorContext('Amazon EC2', 'DescribeDhcpOptions', region, () =>
      client.send(new DescribeDhcpOptionsCommand({ DhcpOptionsIds: ids, NextToken })),
    );
    return {
      resources: (response.DhcpOptions ?? []).map((options) => {
        // Standard values can also be supplied by a customer. Only non-default
        // configuration proves ownership; EC2 exposes no creator/default flag.
        const domain = region === 'us-east-1' ? 'ec2.internal' : `${region}.compute.internal`;
        const custom = options.DhcpConfigurations?.some(
          (option) =>
            (option.Key !== 'domain-name' && option.Key !== 'domain-name-servers') ||
            option.Values?.some(
              (value) => value.Value !== (option.Key === 'domain-name' ? domain : 'AmazonProvidedDNS'),
            ),
        );
        return { id: options.DhcpOptionsId, origin: custom ? 'user' : 'unknown' };
      }),
      nextToken: response.NextToken,
    };
  });
  await load('ec2:subnet', async (ids, NextToken) => {
    const response = await withAwsServiceErrorContext('Amazon EC2', 'DescribeSubnets', region, () =>
      client.send(new DescribeSubnetsCommand({ SubnetIds: ids, NextToken })),
    );
    return {
      resources: (response.Subnets ?? []).map((subnet) => ({
        id: subnet.SubnetId,
        origin: defaultOrigin(subnet.DefaultForAz),
      })),
      nextToken: response.NextToken,
    };
  });
  await load('ec2:network-acl', async (ids, NextToken) => {
    const response = await withAwsServiceErrorContext('Amazon EC2', 'DescribeNetworkAcls', region, () =>
      client.send(new DescribeNetworkAclsCommand({ NetworkAclIds: ids, NextToken })),
    );
    return {
      resources: (response.NetworkAcls ?? []).map((acl) => ({
        id: acl.NetworkAclId,
        origin: defaultOrigin(acl.IsDefault),
      })),
      nextToken: response.NextToken,
    };
  });
  await load('ec2:security-group', async (ids, NextToken) => {
    const response = await describeGroups(ids, NextToken);
    return {
      resources: (response.SecurityGroups ?? []).map((group) => ({
        id: group.GroupId,
        origin: group.GroupName ? defaultOrigin(group.GroupName === 'default') : 'unknown',
      })),
      nextToken: response.NextToken,
    };
  });
  await load('ec2:security-group-rule', async (ids, NextToken) => {
    const response = await withAwsServiceErrorContext('Amazon EC2', 'DescribeSecurityGroupRules', region, () =>
      client.send(new DescribeSecurityGroupRulesCommand({ SecurityGroupRuleIds: ids, NextToken })),
    );
    const missingGroups = [
      ...new Set(
        (response.SecurityGroupRules ?? []).flatMap((rule) =>
          rule.GroupId && !groupNames.has(rule.GroupId) ? [rule.GroupId] : [],
        ),
      ),
    ];
    for (const batch of chunkItems(missingGroups, 100)) {
      let nextToken: string | undefined;
      do {
        const page = await describeGroups(batch, nextToken);
        nextToken = page.NextToken;
      } while (nextToken);
    }
    return {
      resources: (response.SecurityGroupRules ?? []).map((rule) => ({
        id: rule.SecurityGroupRuleId,
        // Rules on a default group may be AWS-provided or customer-added.
        origin:
          rule.GroupId && groupNames.has(rule.GroupId) && groupNames.get(rule.GroupId) !== 'default'
            ? 'user'
            : 'unknown',
      })),
      nextToken: response.NextToken,
    };
  });
};

const loadResourceOrigins = async (resources: AwsDiscoveredResource[]): Promise<Map<string, CreationOrigin>> => {
  const origins = new Map<string, CreationOrigin>();
  const metadataResources = resources.filter(
    (resource) =>
      resource.service === 'ec2' || resource.resourceType === 'kms:key' || resource.resourceType === 'ssm:association',
  );
  const regions = [...new Set(metadataResources.map((resource) => resource.region))];

  await mapWithConcurrency(regions, 5, async (region) => {
    const regionalResources = metadataResources.filter((resource) => resource.region === region);
    await loadEc2ResourceOrigins(regionalResources, region, origins);
    await mapWithConcurrency(
      regionalResources.filter(
        (resource) => resource.resourceType === 'kms:key' || resource.resourceType === 'ssm:association',
      ),
      10,
      async (resource) => {
        origins.set(resource.arn, 'unknown');
        try {
          if (resource.resourceType === 'kms:key') {
            const response = await withAwsServiceErrorContext('AWS KMS', 'DescribeKey', region, () =>
              createKmsClient({ region }).send(new DescribeKeyCommand({ KeyId: resource.arn })),
            );
            const manager = response.KeyMetadata?.KeyManager;
            if (manager === 'AWS' || manager === 'CUSTOMER')
              origins.set(resource.arn, manager === 'AWS' ? 'aws' : 'user');
          } else {
            const associationId = resource.arn.split('/').at(-1);
            const response = await withAwsServiceErrorContext(
              'AWS Systems Manager',
              'DescribeAssociation',
              region,
              () => createSsmClient({ region }).send(new DescribeAssociationCommand({ AssociationId: associationId })),
            );
            const description = response.AssociationDescription;
            if (description?.AssociationId === associationId && description?.Name) {
              const inspectorDocument =
                description.Name.startsWith('AmazonInspector2-') || description.Name === 'AWS-GatherSoftwareInventory';
              origins.set(
                resource.arn,
                inspectorDocument && INSPECTOR_ASSOCIATION_NAMES.has(description.AssociationName ?? '')
                  ? 'aws'
                  : 'user',
              );
            }
          }
        } catch (error) {
          const missingCode = resource.resourceType === 'kms:key' ? 'NotFoundException' : 'AssociationDoesNotExist';
          if (!isAwsAccessDeniedError(error) && getAwsErrorCode(error) !== missingCode) throw error;
        }
      },
    );
  });

  return origins;
};

const isAwsDefaultResource = (resource: AwsDiscoveredResource): boolean => {
  // Match service-specific identities, never all AWS tags: CloudFormation's
  // reserved tags also occur on user-created resources that still need tags.
  const resourceId = resource.arn.split(':').slice(5).join(':');

  switch (resource.resourceType) {
    case 'access-analyzer:analyzer':
      return resourceId.startsWith('analyzer/_AccessAnalyzerForSecurityHubV2-');
    case 'apprunner:autoscalingconfiguration':
      // Customers can create new revisions or reuse the DefaultConfiguration name.
      return resourceId === 'autoscalingconfiguration/DefaultConfiguration/1/00000000000000000000000000000001';
    case 'athena:datacatalog':
      return resourceId === 'datacatalog/AwsDataCatalog';
    case 'athena:workgroup':
      return resourceId === 'workgroup/primary';
    case 'config:config-rule':
      return resourceId.startsWith('config-rule/aws-service-rule/');
    case 'elasticache:user':
      return resourceId === 'user:default';
    case 'events:event-bus':
      return resourceId === 'event-bus/default';
    case 'events:rule':
      return /^rule\/DO-NOT-DELETE-AmazonInspector\w*ManagedRule$/u.test(resourceId);
    case 'iam:role':
      return (
        resourceId.startsWith('role/aws-service-role/') || resourceId.startsWith('role/aws-reserved/sso.amazonaws.com/')
      );
    case 'iam:saml-provider':
      return /^saml-provider\/AWSSSO_\w+_DO_NOT_DELETE$/u.test(resourceId);
    case 'memorydb:acl':
      return resourceId === 'acl/open-access';
    case 'memorydb:parametergroup':
      return resourceId.startsWith('parametergroup/default.memorydb-');
    case 'memorydb:user':
      return resourceId === 'user/default';
    case 's3:storage-lens':
      return resourceId === 'storage-lens/default-account-dashboard';
    case 'ssm:parameter':
      return resourceId === 'parameter/inspector-aws/service/inspector-linux-application-paths';
    case 'xray:sampling-rule':
      return resourceId === 'sampling-rule/Default';
    default:
      return false;
  }
};

/**
 * Loads untagged AWS resource candidates, excluding confirmed AWS defaults and managed resources.
 *
 * @param _resources - Unused because the dataset executes an account-wide Resource Explorer filter.
 * @param context - Discovery loader context providing filtered Resource Explorer access.
 * @returns Normalized candidates, retaining uncertain creation origins for unknown evaluation coverage.
 */
export const hydrateAwsUntaggedResources = async (
  _resources: AwsDiscoveredResource[],
  context: AwsDiscoveryDatasetLoadContext,
): Promise<AwsUntaggedResource[]> => {
  const resources = await context.listResourcesByFilter(UNTAGGED_RESOURCES_FILTER, {
    requiredViewProperties: ['tags'],
    scope: 'account',
  });
  const candidates = resources.filter((resource) => !isAwsDefaultResource(resource));
  const origins = await loadResourceOrigins(candidates);

  return candidates
    .filter((resource) => origins.get(resource.arn) !== 'aws')
    .map((resource) => ({
      accountId: resource.accountId,
      arn: resource.arn,
      region: resource.region,
      resourceType: resource.resourceType,
      service: resource.service,
      ...(origins.get(resource.arn) === 'unknown' ? { creationOrigin: 'unknown' as const } : {}),
    }));
};
