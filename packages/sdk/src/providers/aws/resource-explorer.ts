import {
  CreateResourceExplorerSetupCommand,
  GetDefaultViewCommand,
  GetViewCommand,
  type Index,
  ListIndexesCommand,
  ListResourcesCommand,
  ListSupportedResourceTypesCommand,
  type Resource,
  type ResourceProperty,
  type SupportedResourceType,
} from '@aws-sdk/client-resource-explorer-2';
import type { AwsDiscoveredResource, AwsDiscoveryCatalog } from '@cloudburn/rules';
import type {
  AwsDiscoveryInitialization,
  AwsDiscoveryRegion,
  AwsDiscoveryTarget,
  AwsSupportedResourceType,
} from '../../types.js';
import { assertValidAwsRegion, createResourceExplorerClient, resolveCurrentAwsRegion } from './client.js';
import { AwsDiscoveryError, RESOURCE_EXPLORER_SETUP_DOCS_URL } from './errors.js';

const DEFAULT_RESOURCE_EXPLORER_VIEW_NAME = 'cloudburn-default';

type SearchPlan = {
  searchRegion: string;
  indexType: 'LOCAL' | 'AGGREGATOR';
  regionFilter?: string;
};

const mapProperties = (properties: ResourceProperty[] | undefined): AwsDiscoveredResource['properties'] =>
  (properties ?? []).map((property) => ({
    data: property.Data,
    lastReportedAt: property.LastReportedAt?.toISOString(),
    name: property.Name,
  }));

const mapResource = (resource: Resource): AwsDiscoveredResource | null => {
  if (!resource.Arn || !resource.OwningAccountId || !resource.Region || !resource.Service || !resource.ResourceType) {
    return null;
  }

  return {
    arn: resource.Arn,
    accountId: resource.OwningAccountId,
    region: resource.Region,
    service: resource.Service,
    resourceType: resource.ResourceType,
    properties: mapProperties(resource.Properties),
  };
};

const mapIndex = (index: Index): AwsDiscoveryRegion | null => {
  if (!index.Region || !index.Type) {
    return null;
  }

  return {
    region: assertValidAwsRegion(index.Region),
    type: index.Type === 'AGGREGATOR' ? 'aggregator' : 'local',
  };
};

const mapSupportedResourceType = (resourceType: SupportedResourceType): AwsSupportedResourceType | null => {
  if (!resourceType.ResourceType) {
    return null;
  }

  return {
    resourceType: resourceType.ResourceType,
    service: resourceType.Service,
  };
};

const listIndexesForRegion = async (region: string): Promise<AwsDiscoveryRegion[]> => {
  const client = createResourceExplorerClient({ region });
  const indexes: AwsDiscoveryRegion[] = [];
  let nextToken: string | undefined;

  do {
    const response = await client.send(new ListIndexesCommand({ NextToken: nextToken }));
    const mapped = (response.Indexes ?? []).flatMap((index) => {
      const normalized = mapIndex(index);
      return normalized ? [normalized] : [];
    });

    indexes.push(...mapped);
    nextToken = response.NextToken;
  } while (nextToken);

  return indexes.sort((left, right) => left.region.localeCompare(right.region));
};

const resolveSearchPlan = async (
  target: AwsDiscoveryTarget,
  indexes: AwsDiscoveryRegion[],
  currentRegion: string,
): Promise<SearchPlan> => {
  const validCurrentRegion = assertValidAwsRegion(currentRegion);

  if (indexes.length === 0) {
    throw new AwsDiscoveryError(
      'RESOURCE_EXPLORER_NOT_ENABLED',
      `AWS Resource Explorer is not enabled. Enable it first: ${RESOURCE_EXPLORER_SETUP_DOCS_URL} or run 'cloudburn discover init'.`,
    );
  }

  if (target.mode === 'all') {
    const aggregator = indexes.find((index) => index.type === 'aggregator');

    if (!aggregator) {
      throw new AwsDiscoveryError(
        'RESOURCE_EXPLORER_AGGREGATOR_REQUIRED',
        "Cross-region discovery requires an aggregator index. Enable one first with 'cloudburn discover init' or the AWS console.",
      );
    }

    return {
      searchRegion: aggregator.region,
      indexType: 'AGGREGATOR',
    };
  }

  const requestedRegion = target.mode === 'region' ? assertValidAwsRegion(target.region) : validCurrentRegion;
  const requestedIndex = indexes.find((index) => index.region === requestedRegion);

  if (!requestedIndex) {
    throw new AwsDiscoveryError(
      'RESOURCE_EXPLORER_REGION_NOT_ENABLED',
      `AWS Resource Explorer is not enabled in ${requestedRegion}. Enable it first: ${RESOURCE_EXPLORER_SETUP_DOCS_URL} or run 'cloudburn discover init'.`,
    );
  }

  return {
    searchRegion: requestedRegion,
    indexType: requestedIndex.type === 'aggregator' ? 'AGGREGATOR' : 'LOCAL',
    regionFilter: requestedRegion,
  };
};

const buildFilterString = (resourceType: string, regionFilter?: string): string => {
  if (!regionFilter) {
    return `resourcetype:${resourceType}`;
  }

  return `resourcetype:${resourceType} region:${assertValidAwsRegion(regionFilter)}`;
};

const resolveSearchViewArn = async (searchRegion: string): Promise<string> => {
  const client = createResourceExplorerClient({ region: searchRegion });
  const defaultViewResponse = await client.send(new GetDefaultViewCommand({}));
  const viewArn = defaultViewResponse.ViewArn;

  if (!viewArn) {
    throw new AwsDiscoveryError(
      'RESOURCE_EXPLORER_DEFAULT_VIEW_REQUIRED',
      `AWS Resource Explorer does not have a default view in ${searchRegion}. Create one with 'cloudburn discover init' or configure a default view in the AWS console.`,
    );
  }

  const viewResponse = await client.send(
    new GetViewCommand({
      ViewArn: viewArn,
    }),
  );
  const filterString = viewResponse.View?.Filters?.FilterString?.trim();

  if (filterString) {
    throw new AwsDiscoveryError(
      'RESOURCE_EXPLORER_FILTERED_VIEW_UNSUPPORTED',
      `The default AWS Resource Explorer view in ${searchRegion} applies additional filters and can hide resources from discovery. Use 'cloudburn discover init' or configure an unfiltered default view first.`,
    );
  }

  return viewArn;
};

/**
 * Lists all AWS Resource Explorer index regions visible to the current account.
 *
 * @returns Enabled local and aggregator index regions.
 */
export const listAwsDiscoveryIndexes = async (): Promise<AwsDiscoveryRegion[]> => {
  const currentRegion = await resolveCurrentAwsRegion();

  return listIndexesForRegion(currentRegion);
};

/**
 * Builds the normalized AWS discovery catalog for the requested target.
 *
 * @param target - Discovery target that controls region or aggregator behavior.
 * @param resourceTypes - Resource Explorer resource types required by active rules.
 * @returns Catalog of discovered AWS resources plus search metadata.
 */
export const buildAwsDiscoveryCatalog = async (
  target: AwsDiscoveryTarget,
  resourceTypes: string[],
): Promise<AwsDiscoveryCatalog> => {
  const currentRegion = await resolveCurrentAwsRegion();
  const indexes = await listIndexesForRegion(currentRegion);
  const searchPlan = await resolveSearchPlan(target, indexes, currentRegion);
  const client = createResourceExplorerClient({ region: searchPlan.searchRegion });
  const viewArn = await resolveSearchViewArn(searchPlan.searchRegion);
  const resourcesByArn = new Map<string, AwsDiscoveredResource>();

  for (const resourceType of resourceTypes) {
    let nextToken: string | undefined;

    do {
      const response = await client.send(
        new ListResourcesCommand({
          Filters: {
            FilterString: buildFilterString(resourceType, searchPlan.regionFilter),
          },
          MaxResults: 100,
          NextToken: nextToken,
          ViewArn: viewArn,
        }),
      );

      for (const resource of response.Resources ?? []) {
        const normalized = mapResource(resource);

        if (normalized) {
          resourcesByArn.set(normalized.arn, normalized);
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);
  }

  return {
    resources: [...resourcesByArn.values()].sort((left, right) => left.arn.localeCompare(right.arn)),
    searchRegion: searchPlan.searchRegion,
    indexType: searchPlan.indexType,
    viewArn,
  };
};

/**
 * Creates a Resource Explorer setup across the supplied AWS regions.
 *
 * @param aggregatorRegion - Region that should host the aggregator index.
 * @param regions - Regions to enable for Resource Explorer indexing.
 * @returns Setup metadata for the created task.
 */
export const createAwsResourceExplorerSetup = async (
  aggregatorRegion: string,
  regions: string[],
): Promise<AwsDiscoveryInitialization> => {
  const validAggregatorRegion = assertValidAwsRegion(aggregatorRegion);
  const normalizedRegions = [
    ...new Set([...regions, validAggregatorRegion].map((region) => assertValidAwsRegion(region))),
  ].sort((left, right) => left.localeCompare(right));
  const client = createResourceExplorerClient({ region: validAggregatorRegion });
  const response = await client.send(
    new CreateResourceExplorerSetupCommand({
      AggregatorRegions: [validAggregatorRegion],
      RegionList: normalizedRegions,
      ViewName: DEFAULT_RESOURCE_EXPLORER_VIEW_NAME,
    }),
  );

  return {
    aggregatorRegion: validAggregatorRegion,
    regions: normalizedRegions,
    status: 'CREATED',
    taskId: response.TaskId,
  };
};

/**
 * Lists the AWS resource types supported by Resource Explorer.
 *
 * @returns Supported resource type identifiers.
 */
export const listAwsDiscoverySupportedResourceTypes = async (): Promise<AwsSupportedResourceType[]> => {
  const currentRegion = await resolveCurrentAwsRegion();
  const client = createResourceExplorerClient({ region: currentRegion });
  const resourceTypes: AwsSupportedResourceType[] = [];
  let nextToken: string | undefined;

  do {
    const response = await client.send(new ListSupportedResourceTypesCommand({ NextToken: nextToken }));
    const mapped = (response.ResourceTypes ?? []).flatMap((resourceType) => {
      const normalized = mapSupportedResourceType(resourceType);
      return normalized ? [normalized] : [];
    });

    resourceTypes.push(...mapped);
    nextToken = response.NextToken;
  } while (nextToken);

  return resourceTypes.sort((left, right) => left.resourceType.localeCompare(right.resourceType));
};
