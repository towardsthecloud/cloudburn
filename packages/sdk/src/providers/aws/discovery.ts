import type { DiscoveryDatasetKey, DiscoveryDatasetMap, LiveEvaluationContext, Rule } from '@cloudburn/rules';
import { LiveResourceBag } from '@cloudburn/rules';
import type {
  AwsDiscoveryInitialization,
  AwsDiscoveryRegion,
  AwsDiscoveryTarget,
  AwsSupportedResourceType,
} from '../../types.js';
import { assertValidAwsRegion, listEnabledAwsRegions, resolveCurrentAwsRegion } from './client.js';
import { getAwsDiscoveryDatasetDefinition } from './discovery-registry.js';
import { AwsDiscoveryError } from './errors.js';
import {
  buildAwsDiscoveryCatalog,
  createAwsResourceExplorerSetup,
  listAwsDiscoveryIndexes,
  listAwsDiscoverySupportedResourceTypes,
} from './resource-explorer.js';

const sortUnique = (values: string[]): string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const RESOURCE_EXPLORER_RESOURCE_TYPE_PATTERN = /^[a-z0-9-]+:[a-z0-9-]+$/;

const assertValidResourceExplorerResourceType = (resourceType: string): string => {
  if (!RESOURCE_EXPLORER_RESOURCE_TYPE_PATTERN.test(resourceType)) {
    throw new AwsDiscoveryError(
      'INVALID_RESOURCE_EXPLORER_RESOURCE_TYPE',
      `Invalid Resource Explorer resource type '${resourceType}'. Expected a value like 'ec2:volume'.`,
    );
  }

  return resourceType;
};

const collectDiscoveryDependencies = (rules: Rule[]): DiscoveryDatasetKey[] => {
  const datasetKeys: DiscoveryDatasetKey[] = [];

  for (const rule of rules) {
    if (!rule.supports.includes('discovery') || !rule.evaluateLive) {
      continue;
    }

    if (!rule.discoveryDependencies || rule.discoveryDependencies.length === 0) {
      throw new Error(`Discovery rule ${rule.id} is missing discoveryDependencies metadata.`);
    }

    for (const datasetKey of rule.discoveryDependencies) {
      const definition = getAwsDiscoveryDatasetDefinition(datasetKey);
      if (!definition) {
        throw new Error(`Discovery rule ${rule.id} declares unknown discovery dependency '${datasetKey}'.`);
      }

      datasetKeys.push(definition.datasetKey);
    }
  }

  return sortUnique(datasetKeys) as DiscoveryDatasetKey[];
};

/**
 * Discovers AWS resources for live rule evaluation using Resource Explorer and
 * registry-driven discovery datasets.
 *
 * @param rules - Active rules that declare their discovery dataset requirements.
 * @param target - Discovery target controlling current-region, explicit-region, or all-region behavior.
 * @returns Hydrated live evaluation context.
 */
export const discoverAwsResources = async (
  rules: Rule[],
  target: AwsDiscoveryTarget,
): Promise<LiveEvaluationContext> => {
  const datasetKeys = collectDiscoveryDependencies(rules);

  if (datasetKeys.length === 0) {
    return {
      catalog: {
        resources: [],
        searchRegion: await resolveCurrentAwsRegion(),
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag(),
    };
  }

  const datasetDefinitions = datasetKeys.map((datasetKey) => {
    const definition = getAwsDiscoveryDatasetDefinition(datasetKey);

    if (!definition) {
      throw new Error(`Unknown discovery dataset '${datasetKey}'.`);
    }

    return definition;
  });
  const resourceTypes = sortUnique(
    datasetDefinitions.flatMap((definition) => definition.resourceTypes.map(assertValidResourceExplorerResourceType)),
  );
  const catalog = await buildAwsDiscoveryCatalog(target, resourceTypes);
  const loadedDatasets = await Promise.all(
    datasetDefinitions.map(async (definition) => {
      const matchingResources = catalog.resources.filter((resource) =>
        definition.resourceTypes.includes(resource.resourceType),
      );

      return [definition.datasetKey, await definition.load(matchingResources)] as const;
    }),
  );
  const resources = new LiveResourceBag(Object.fromEntries(loadedDatasets) as Partial<DiscoveryDatasetMap>);

  return {
    catalog,
    resources,
  };
};

/**
 * Lists all AWS regions with an enabled Resource Explorer index.
 *
 * @returns Enabled local and aggregator index regions.
 */
export const listEnabledAwsDiscoveryRegions = async (): Promise<AwsDiscoveryRegion[]> => listAwsDiscoveryIndexes();

/**
 * Bootstraps Resource Explorer across enabled AWS regions.
 *
 * @param region - Optional explicit aggregator region.
 * @returns Setup metadata for the created configuration.
 */
export const initializeAwsDiscovery = async (region?: string): Promise<AwsDiscoveryInitialization> => {
  const indexes = await listAwsDiscoveryIndexes();
  const aggregator = indexes.find((index) => index.type === 'aggregator');

  if (aggregator) {
    return {
      aggregatorRegion: aggregator.region,
      regions: sortUnique(indexes.map((index) => index.region)),
      status: 'EXISTING',
    };
  }

  const aggregatorRegion = region ? assertValidAwsRegion(region) : await resolveCurrentAwsRegion();
  const enabledRegions = await listEnabledAwsRegions();

  return createAwsResourceExplorerSetup(aggregatorRegion, enabledRegions);
};

/**
 * Lists AWS resource types supported by Resource Explorer.
 *
 * @returns Supported Resource Explorer resource type identifiers.
 */
export const listSupportedAwsResourceTypes = async (): Promise<AwsSupportedResourceType[]> =>
  listAwsDiscoverySupportedResourceTypes();
