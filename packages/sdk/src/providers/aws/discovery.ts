import type { DiscoveryDatasetKey, DiscoveryDatasetMap, LiveEvaluationContext, Rule } from '@cloudburn/rules';
import { LiveResourceBag } from '@cloudburn/rules';
import type {
  AwsDiscoveryInitialization,
  AwsDiscoveryRegion,
  AwsDiscoveryStatus,
  AwsDiscoveryTarget,
  AwsSupportedResourceType,
  ScanDiagnostic,
} from '../../types.js';
import { assertValidAwsRegion, listEnabledAwsRegions, resolveCurrentAwsRegion } from './client.js';
import { getAwsDiscoveryDatasetDefinition } from './discovery-registry.js';
import { AwsDiscoveryError, getAwsErrorCode, isAwsAccessDeniedError } from './errors.js';
import {
  buildAwsDiscoveryCatalog,
  createAwsResourceExplorerSetup,
  getAwsDiscoveryRegionStatus,
  listAwsDiscoveryIndexes,
  listAwsDiscoverySupportedResourceTypes,
  updateAwsResourceExplorerIndexType,
  waitForAwsResourceExplorerIndex,
  waitForAwsResourceExplorerSetup,
} from './resource-explorer.js';

const sortUnique = (values: string[]): string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const pluralize = (count: number, singular: string, plural: string): string => (count === 1 ? singular : plural);

const buildDiscoveryWarning = (
  regionStatuses: AwsDiscoveryStatus['regions'],
  indexedRegionCount: number,
  totalRegionCount: number,
): string | undefined => {
  const deniedCount = regionStatuses.filter((region) => region.status === 'access_denied').length;

  if (deniedCount > 0) {
    return `Discovery coverage is limited. ${deniedCount} of ${totalRegionCount} regions could not be inspected, which may be intentional if SCPs restrict regional Resource Explorer access.`;
  }

  if (indexedRegionCount > 0 && indexedRegionCount < totalRegionCount) {
    return `Discovery coverage is limited. Only ${indexedRegionCount} of ${totalRegionCount} ${pluralize(indexedRegionCount, 'region is', 'regions are')} indexed.`;
  }

  const blockingViewRegion = regionStatuses.find(
    (region) =>
      region.indexType === 'aggregator' &&
      region.status === 'indexed' &&
      region.viewStatus !== undefined &&
      region.viewStatus !== 'present',
  );

  if (blockingViewRegion) {
    return `Cross-region discovery is limited because the default view in ${blockingViewRegion.region} is ${blockingViewRegion.viewStatus}.`;
  }

  return undefined;
};

const resolveCoverage = (
  statuses: AwsDiscoveryStatus['regions'],
  totalRegionCount: number,
): AwsDiscoveryStatus['coverage'] => {
  const indexedRegions = statuses.filter((region) => region.status === 'indexed');
  const aggregator = indexedRegions.find((region) => region.indexType === 'aggregator');

  if (indexedRegions.length === 0) {
    return 'none';
  }

  if (!aggregator) {
    return indexedRegions.length === 1 ? 'local_only' : 'partial';
  }

  if (indexedRegions.length === totalRegionCount) {
    return 'full';
  }

  return 'partial';
};

const getIndexedRegions = (status: AwsDiscoveryStatus): string[] =>
  status.regions.filter((region) => region.status === 'indexed').map((region) => region.region);

const combineVerificationStatus = (
  left: AwsDiscoveryInitialization['verificationStatus'],
  right: AwsDiscoveryInitialization['verificationStatus'],
): AwsDiscoveryInitialization['verificationStatus'] =>
  left === 'timed_out' || right === 'timed_out' ? 'timed_out' : 'verified';

const buildInitializationResult = (options: {
  aggregatorAction: AwsDiscoveryInitialization['aggregatorAction'];
  aggregatorRegion: string;
  beforeIndexedRegions: Set<string>;
  coverage: AwsDiscoveryStatus['coverage'];
  indexType: AwsDiscoveryInitialization['indexType'];
  observedStatus: AwsDiscoveryStatus;
  status: AwsDiscoveryInitialization['status'];
  taskId?: string;
  verificationStatus: AwsDiscoveryInitialization['verificationStatus'];
  warning?: string;
}): AwsDiscoveryInitialization => {
  const indexedRegions = getIndexedRegions(options.observedStatus);
  const createdIndexCount = indexedRegions.filter((region) => !options.beforeIndexedRegions.has(region)).length;
  const reusedIndexCount = indexedRegions.length - createdIndexCount;

  return {
    aggregatorAction: options.aggregatorAction,
    aggregatorRegion: options.aggregatorRegion,
    coverage: options.coverage,
    createdIndexCount,
    indexType: options.indexType,
    observedStatus: options.observedStatus,
    regions: indexedRegions,
    reusedIndexCount,
    status: options.status,
    taskId: options.taskId,
    verificationStatus: options.verificationStatus,
    warning: options.warning,
  };
};

const RESOURCE_EXPLORER_RESOURCE_TYPE_PATTERN = /^[a-z0-9-]+:[a-z0-9-]+(?:\/[a-z0-9-]+)?$/;

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

type LiveDiscoveryContext = LiveEvaluationContext & {
  diagnostics: ScanDiagnostic[];
};

const groupResourcesByRegion = <T extends { region: string }>(resources: T[]): Map<string, T[]> => {
  const resourcesByRegion = new Map<string, T[]>();

  for (const resource of resources) {
    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push(resource);
    resourcesByRegion.set(resource.region, regionResources);
  }

  return resourcesByRegion;
};

const isScpAccessDeniedError = (err: unknown): boolean =>
  err instanceof Error &&
  (err.message.toLowerCase().includes('service control policy') || err.message.toLowerCase().includes('by scp'));

const buildAccessDeniedDiagnosticMessage = (service: string, region: string, err: unknown): string =>
  isScpAccessDeniedError(err)
    ? `Skipped ${service} discovery in ${region} because access is denied by a service control policy (SCP).`
    : `Skipped ${service} discovery in ${region} because access is denied by AWS permissions.`;

const normalizeDatasetLoadResult = (
  loadResult: unknown[] | { diagnostics?: ScanDiagnostic[]; resources: unknown[] },
): { diagnostics: ScanDiagnostic[]; resources: unknown[] } =>
  Array.isArray(loadResult)
    ? {
        diagnostics: [],
        resources: loadResult,
      }
    : {
        diagnostics: loadResult.diagnostics ?? [],
        resources: loadResult.resources,
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
): Promise<LiveDiscoveryContext> => {
  const datasetKeys = collectDiscoveryDependencies(rules);

  if (datasetKeys.length === 0) {
    return {
      catalog: {
        resources: [],
        searchRegion: await resolveCurrentAwsRegion(),
        indexType: 'LOCAL',
      },
      diagnostics: [],
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
  const datasetLoads = await Promise.all(
    datasetDefinitions.map(async (definition) => {
      const matchingResources = catalog.resources.filter((resource) =>
        definition.resourceTypes.includes(resource.resourceType),
      );
      const resourcesByRegion = groupResourcesByRegion(matchingResources);
      const loadedResources: unknown[] = [];
      const diagnostics: ScanDiagnostic[] = [];

      for (const [region, regionResources] of resourcesByRegion) {
        try {
          const loadResult = normalizeDatasetLoadResult(await definition.load(regionResources));
          loadedResources.push(...loadResult.resources);
          diagnostics.push(...loadResult.diagnostics);
        } catch (err) {
          if (!isAwsAccessDeniedError(err)) {
            throw err;
          }

          diagnostics.push({
            code: getAwsErrorCode(err),
            details: err instanceof Error ? err.message : String(err),
            message: buildAccessDeniedDiagnosticMessage(definition.service, region, err),
            provider: 'aws',
            region,
            service: definition.service,
            source: 'discovery',
            status: 'access_denied',
          });
        }
      }

      return {
        dataset: [definition.datasetKey, loadedResources] as const,
        diagnostics,
      };
    }),
  );
  const resources = new LiveResourceBag(
    Object.fromEntries(datasetLoads.map((loadResult) => loadResult.dataset)) as Partial<DiscoveryDatasetMap>,
  );

  return {
    catalog,
    diagnostics: datasetLoads.flatMap((loadResult) => loadResult.diagnostics),
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
 * Retrieves observed Resource Explorer status across all enabled AWS regions.
 *
 * @param region - Optional explicit region to use as the preferred control region.
 * @returns Observed discovery status across the account.
 */
export const getAwsDiscoveryStatus = async (region?: string): Promise<AwsDiscoveryStatus> => {
  const selectedRegion = region ? assertValidAwsRegion(region) : await resolveCurrentAwsRegion();
  const enabledRegions = await listEnabledAwsRegions(selectedRegion);
  const statuses = await Promise.all(enabledRegions.map((enabledRegion) => getAwsDiscoveryRegionStatus(enabledRegion)));
  const orderedStatuses = [...statuses].sort((left, right) => left.region.localeCompare(right.region));
  const indexedRegionCount = orderedStatuses.filter((status) => status.status === 'indexed').length;
  const accessibleRegionCount = orderedStatuses.filter(
    (status) => status.status !== 'access_denied' && status.status !== 'error' && status.status !== 'unsupported',
  ).length;
  const aggregatorRegion = orderedStatuses.find((status) => status.indexType === 'aggregator')?.region;
  const coverage = resolveCoverage(orderedStatuses, enabledRegions.length);
  const warning = buildDiscoveryWarning(orderedStatuses, indexedRegionCount, enabledRegions.length);

  return {
    accessibleRegionCount,
    aggregatorRegion,
    coverage,
    indexedRegionCount,
    regions: orderedStatuses,
    totalRegionCount: enabledRegions.length,
    warning,
  };
};

/**
 * Bootstraps Resource Explorer across enabled AWS regions.
 *
 * @param region - Optional explicit aggregator region.
 * @returns Setup metadata for the created configuration.
 */
export const initializeAwsDiscovery = async (region?: string): Promise<AwsDiscoveryInitialization> => {
  const explicitRegionRequested = region !== undefined;
  const selectedRegion = region ? assertValidAwsRegion(region) : await resolveCurrentAwsRegion();
  const observedStatus = await getAwsDiscoveryStatus(selectedRegion);
  const enabledRegions = await listEnabledAwsRegions(selectedRegion);
  const indexes = await listAwsDiscoveryIndexes(selectedRegion);
  const beforeIndexedRegions = new Set(indexes.map((index) => index.region));
  const aggregator = indexes.find((index) => index.type === 'aggregator');

  if (aggregator) {
    if (explicitRegionRequested && aggregator.region !== selectedRegion) {
      throw new AwsDiscoveryError(
        'RESOURCE_EXPLORER_AGGREGATOR_SWITCH_REQUIRES_DELAY',
        `AWS Resource Explorer already has an aggregator in ${aggregator.region}. AWS requires demoting that index to LOCAL and waiting 24 hours before promoting ${selectedRegion} to be the new aggregator.`,
      );
    }

    return buildInitializationResult({
      aggregatorAction: 'unchanged',
      aggregatorRegion: observedStatus.aggregatorRegion ?? aggregator.region,
      beforeIndexedRegions,
      coverage: observedStatus.coverage,
      indexType: 'aggregator',
      observedStatus,
      status: 'EXISTING',
      verificationStatus: 'verified',
      warning: observedStatus.warning,
    });
  }

  const existingLocal = observedStatus.regions.find(
    (status) => status.region === selectedRegion && status.status === 'indexed' && status.indexType === 'local',
  );

  if (existingLocal && enabledRegions.every((enabledRegion) => beforeIndexedRegions.has(enabledRegion))) {
    try {
      const promotion = await updateAwsResourceExplorerIndexType(selectedRegion, 'aggregator');
      const verificationStatus =
        promotion.state === 'ACTIVE' ? 'verified' : await waitForAwsResourceExplorerIndex(selectedRegion);
      const updatedStatus = await getAwsDiscoveryStatus(selectedRegion);

      return buildInitializationResult({
        aggregatorAction: 'promoted',
        aggregatorRegion: updatedStatus.aggregatorRegion ?? selectedRegion,
        beforeIndexedRegions,
        coverage: updatedStatus.coverage,
        indexType: updatedStatus.aggregatorRegion ? 'aggregator' : 'local',
        observedStatus: updatedStatus,
        status: 'EXISTING',
        verificationStatus,
        warning: updatedStatus.warning,
      });
    } catch (err) {
      if (!isAwsAccessDeniedError(err)) {
        throw err;
      }

      const updatedStatus = await getAwsDiscoveryStatus(selectedRegion);

      return buildInitializationResult({
        aggregatorAction: 'none',
        aggregatorRegion: selectedRegion,
        beforeIndexedRegions,
        coverage: updatedStatus.coverage,
        indexType: 'local',
        observedStatus: updatedStatus,
        status: 'EXISTING',
        verificationStatus: 'verified',
        warning:
          updatedStatus.warning ??
          `Cross-region Resource Explorer setup could not be promoted in ${selectedRegion}; using the existing local index.`,
      });
    }
  }

  let createdSetup: Awaited<ReturnType<typeof createAwsResourceExplorerSetup>> | undefined;

  try {
    createdSetup = await createAwsResourceExplorerSetup({
      aggregatorRegion: selectedRegion,
      region: selectedRegion,
      regions: enabledRegions,
    });
  } catch (err) {
    if (!isAwsAccessDeniedError(err)) {
      throw err;
    }

    if (existingLocal) {
      const updatedStatus = await getAwsDiscoveryStatus(selectedRegion);

      return buildInitializationResult({
        aggregatorAction: 'none',
        aggregatorRegion: selectedRegion,
        beforeIndexedRegions,
        coverage: updatedStatus.coverage,
        indexType: 'local',
        observedStatus: updatedStatus,
        status: 'EXISTING',
        verificationStatus: 'verified',
        warning:
          updatedStatus.warning ??
          `Cross-region Resource Explorer setup could not be created; using the existing local index in ${selectedRegion}.`,
      });
    }

    const localSetup = await createAwsResourceExplorerSetup({
      region: selectedRegion,
      regions: [selectedRegion],
    });
    const verificationStatus = localSetup.taskId
      ? await waitForAwsResourceExplorerSetup(localSetup.taskId, selectedRegion)
      : 'verified';
    const updatedStatus = await getAwsDiscoveryStatus(selectedRegion);
    const localRegion =
      updatedStatus.regions.find((status) => status.region === selectedRegion && status.status === 'indexed')?.region ??
      selectedRegion;

    return buildInitializationResult({
      aggregatorAction: 'none',
      aggregatorRegion: localRegion,
      beforeIndexedRegions,
      coverage: updatedStatus.coverage,
      indexType: 'local',
      observedStatus: updatedStatus,
      status: localSetup.taskId ? 'CREATED' : 'EXISTING',
      taskId: localSetup.taskId,
      verificationStatus,
      warning:
        updatedStatus.warning ??
        `Cross-region Resource Explorer setup could not be created; using a local index in ${selectedRegion}.`,
    });
  }

  const verificationStatus = createdSetup.taskId
    ? await waitForAwsResourceExplorerSetup(createdSetup.taskId, selectedRegion)
    : 'verified';
  let updatedStatus = await getAwsDiscoveryStatus(selectedRegion);
  let finalVerificationStatus = verificationStatus;

  if (!updatedStatus.aggregatorRegion) {
    const selectedIndexedRegion = updatedStatus.regions.find(
      (status) => status.region === selectedRegion && status.status === 'indexed' && status.indexType === 'local',
    );

    if (selectedIndexedRegion) {
      try {
        const promotion = await updateAwsResourceExplorerIndexType(selectedRegion, 'aggregator');
        const promotionVerificationStatus =
          promotion.state === 'ACTIVE' ? 'verified' : await waitForAwsResourceExplorerIndex(selectedRegion);

        finalVerificationStatus = combineVerificationStatus(finalVerificationStatus, promotionVerificationStatus);
        updatedStatus = await getAwsDiscoveryStatus(selectedRegion);
      } catch (err) {
        if (!isAwsAccessDeniedError(err)) {
          throw err;
        }

        return buildInitializationResult({
          aggregatorAction: 'none',
          aggregatorRegion: selectedRegion,
          beforeIndexedRegions,
          coverage: updatedStatus.coverage,
          indexType: 'local',
          observedStatus: updatedStatus,
          status:
            createdSetup.taskId ||
            getIndexedRegions(updatedStatus).some((indexedRegion) => !beforeIndexedRegions.has(indexedRegion))
              ? 'CREATED'
              : 'EXISTING',
          taskId: createdSetup.taskId,
          verificationStatus: finalVerificationStatus,
          warning:
            updatedStatus.warning ??
            `Cross-region Resource Explorer setup could not be promoted in ${selectedRegion}; using a local index.`,
        });
      }
    }
  }

  const status =
    createdSetup.taskId ||
    getIndexedRegions(updatedStatus).some((indexedRegion) => !beforeIndexedRegions.has(indexedRegion))
      ? 'CREATED'
      : 'EXISTING';
  const aggregatorAction = updatedStatus.aggregatorRegion
    ? beforeIndexedRegions.has(selectedRegion)
      ? 'promoted'
      : 'created'
    : 'none';

  return buildInitializationResult({
    aggregatorAction,
    aggregatorRegion:
      updatedStatus.aggregatorRegion ??
      updatedStatus.regions.find((status) => status.region === selectedRegion && status.status === 'indexed')?.region ??
      selectedRegion,
    beforeIndexedRegions,
    coverage: updatedStatus.coverage,
    indexType: updatedStatus.aggregatorRegion ? 'aggregator' : createdSetup.indexType,
    observedStatus: updatedStatus,
    status,
    taskId: createdSetup.taskId,
    verificationStatus: finalVerificationStatus,
    warning: updatedStatus.warning,
  });
};

/**
 * Lists AWS resource types supported by Resource Explorer.
 *
 * @returns Supported Resource Explorer resource type identifiers.
 */
export const listSupportedAwsResourceTypes = async (): Promise<AwsSupportedResourceType[]> =>
  listAwsDiscoverySupportedResourceTypes();
