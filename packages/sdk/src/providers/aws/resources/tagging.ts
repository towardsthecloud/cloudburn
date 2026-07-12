import type { AwsDiscoveredResource, AwsUntaggedResource } from '@cloudburn/rules';
import type { AwsDiscoveryDatasetLoadContext } from '../discovery-registry.js';

const UNTAGGED_RESOURCES_FILTER = 'resourcetype.supports:tags tag:none';

/**
 * Loads every taggable AWS resource that Resource Explorer reports without user-created tags.
 *
 * @param _resources - Unused because the dataset executes an account-wide Resource Explorer filter.
 * @param context - Discovery loader context providing filtered Resource Explorer access.
 * @returns Normalized untagged resources.
 */
export const hydrateAwsUntaggedResources = async (
  _resources: AwsDiscoveredResource[],
  context: AwsDiscoveryDatasetLoadContext,
): Promise<AwsUntaggedResource[]> => {
  const resources = await context.listResourcesByFilter(UNTAGGED_RESOURCES_FILTER, {
    requiredViewProperties: ['tags'],
    scope: 'account',
  });

  return resources.map((resource) => ({
    accountId: resource.accountId,
    arn: resource.arn,
    region: resource.region,
    resourceType: resource.resourceType,
    service: resource.service,
  }));
};
