import type { LiveEvaluationContext, Rule } from '@cloudburn/rules';
import type {
  AwsDiscoveryInitialization,
  AwsDiscoveryRegion,
  AwsDiscoveryTarget,
  AwsSupportedResourceType,
} from '../../types.js';
import { assertValidAwsRegion, listEnabledAwsRegions, resolveCurrentAwsRegion } from './client.js';
import { AwsDiscoveryError } from './errors.js';
import {
  buildAwsDiscoveryCatalog,
  createAwsResourceExplorerSetup,
  listAwsDiscoveryIndexes,
  listAwsDiscoverySupportedResourceTypes,
} from './resource-explorer.js';
import { hydrateAwsEbsVolumes } from './resources/ebs.js';
import { hydrateAwsEc2Instances } from './resources/ec2.js';
import { hydrateAwsLambdaFunctions } from './resources/lambda.js';

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

const collectLiveDiscoveryRequirements = (
  rules: Rule[],
): {
  hydrators: Set<string>;
  resourceTypes: string[];
} => {
  const hydrators = new Set<string>();
  const resourceTypes: string[] = [];

  for (const rule of rules) {
    if (!rule.supports.includes('discovery') || !rule.evaluateLive) {
      continue;
    }

    if (!rule.liveDiscovery) {
      throw new Error(`Discovery rule ${rule.id} is missing liveDiscovery metadata.`);
    }

    for (const resourceType of rule.liveDiscovery.resourceTypes) {
      resourceTypes.push(assertValidResourceExplorerResourceType(resourceType));
    }

    if (rule.liveDiscovery.hydrator) {
      hydrators.add(rule.liveDiscovery.hydrator);
    }
  }

  return {
    hydrators,
    resourceTypes: sortUnique(resourceTypes),
  };
};

/**
 * Discovers AWS resources for live rule evaluation using Resource Explorer and
 * targeted hydrators.
 *
 * @param rules - Active rules that declare their discovery requirements.
 * @param target - Discovery target controlling current-region, explicit-region, or all-region behavior.
 * @returns Hydrated live evaluation context.
 */
export const scanAwsResources = async (rules: Rule[], target: AwsDiscoveryTarget): Promise<LiveEvaluationContext> => {
  const requirements = collectLiveDiscoveryRequirements(rules);

  if (requirements.resourceTypes.length === 0) {
    return {
      catalog: {
        resources: [],
        searchRegion: await resolveCurrentAwsRegion(),
        indexType: 'LOCAL',
      },
      ebsVolumes: [],
      ec2Instances: [],
      lambdaFunctions: [],
    };
  }

  const catalog = await buildAwsDiscoveryCatalog(target, requirements.resourceTypes);
  const ebsResources = catalog.resources.filter((resource) => resource.resourceType === 'ec2:volume');
  const ec2Resources = catalog.resources.filter((resource) => resource.resourceType === 'ec2:instance');
  const lambdaResources = catalog.resources.filter((resource) => resource.resourceType === 'lambda:function');
  const [ebsVolumes, ec2Instances, lambdaFunctions] = await Promise.all([
    requirements.hydrators.has('aws-ebs-volume') ? hydrateAwsEbsVolumes(ebsResources) : Promise.resolve([]),
    requirements.hydrators.has('aws-ec2-instance') ? hydrateAwsEc2Instances(ec2Resources) : Promise.resolve([]),
    requirements.hydrators.has('aws-lambda-function')
      ? hydrateAwsLambdaFunctions(lambdaResources)
      : Promise.resolve([]),
  ]);

  return {
    catalog,
    ebsVolumes,
    ec2Instances,
    lambdaFunctions,
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
