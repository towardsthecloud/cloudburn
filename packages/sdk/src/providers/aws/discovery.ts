import type {
  AwsDiscoveredResource,
  DiscoveryDatasetKey,
  DiscoveryDatasetMap,
  LiveEvaluationContext,
  Rule,
} from '@cloudburn/rules';
import { LiveResourceBag } from '@cloudburn/rules';
import { emitDebugLog } from '../../debug.js';
import type {
  AwsDiscoveryCatalog,
  AwsDiscoveryInitialization,
  AwsDiscoveryProgressEvent,
  AwsDiscoveryStatus,
  AwsDiscoveryTarget,
  AwsSupportedResourceType,
  ScanDiagnostic,
} from '../../types.js';
import { assertValidAwsRegion, listEnabledAwsRegions, resolveAwsAccountId, resolveCurrentAwsRegion } from './client.js';
import {
  type AwsDiscoveryDatasetLoadContext,
  assessAwsDiscoveryDatasetEvidence,
  getAwsDiscoveryDatasetDefinition,
  resolveAwsDiscoveryDatasetDependencies,
  resolveAwsDiscoveryObservationWindow,
} from './discovery-registry.js';
import {
  AwsDiscoveryError,
  formatAwsAccessDeniedReason,
  getAwsErrorCode,
  isAwsAccessDeniedError,
  isAwsThrottlingError,
} from './errors.js';
import {
  annotateAwsEvidence,
  fingerprintAwsEvidence,
  getAwsEvidenceProvenance,
  getAwsEvidenceTtl,
  isAwsEvidenceCacheEnabled,
  loadAwsCachedEvidence,
} from './evidence.js';
import { getAwsDiscoveryTimestamp, throwIfAwsExecutionAborted } from './execution.js';
import {
  buildAwsDiscoveryCatalog,
  createAwsResourceExplorerSetup,
  ensureAwsResourceExplorerDefaultViewIncludesTags,
  getAwsDiscoveryRegionStatus,
  getAwsResourceExplorerEvidenceScope,
  listAwsDiscoveryIndexes,
  listAwsDiscoverySupportedResourceTypes,
  listAwsResourcesByFilter,
  updateAwsResourceExplorerIndexType,
  waitForAwsResourceExplorerIndex,
  waitForAwsResourceExplorerSetup,
} from './resource-explorer.js';
import { mapWithConcurrency } from './resources/utils.js';

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

type InitializationResultOptions = {
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
};

const finalizeInitializationResult = async (
  options: InitializationResultOptions,
): Promise<AwsDiscoveryInitialization> => {
  const indexedRegions = getIndexedRegions(options.observedStatus);
  const createdIndexCount = indexedRegions.filter((region) => !options.beforeIndexedRegions.has(region)).length;
  const reusedIndexCount = indexedRegions.length - createdIndexCount;

  const result: AwsDiscoveryInitialization = {
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

  if (result.verificationStatus === 'verified') {
    await ensureAwsResourceExplorerDefaultViewIncludesTags(result.aggregatorRegion);
  }

  return result;
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

    for (const datasetKey of rule.optionalDiscoveryDependencies ?? []) {
      if (!getAwsDiscoveryDatasetDefinition(datasetKey)) {
        throw new Error(`Discovery rule ${rule.id} declares unknown optional discovery dependency '${datasetKey}'.`);
      }
    }
  }

  return sortUnique(datasetKeys) as DiscoveryDatasetKey[];
};

type LiveDiscoveryContext = LiveEvaluationContext & {
  diagnostics: ScanDiagnostic[];
  unavailableDatasets?: Map<DiscoveryDatasetKey, ScanDiagnostic[]>;
  unavailableRegions?: Map<DiscoveryDatasetKey, Set<string>>;
};

type AwsDiscoveryDatasetLoad<K extends DiscoveryDatasetKey = DiscoveryDatasetKey> = {
  dataset: [K, DiscoveryDatasetMap[K]];
  diagnostics: ScanDiagnostic[];
  unavailable: boolean;
  unavailableDiagnostics?: ScanDiagnostic[];
  fingerprint?: string;
  coverage?: import('../../types.js').LiveEvaluationCoverage;
};

class UnavailableDiscoveryDatasetError extends Error {
  constructor(
    readonly datasetKey: DiscoveryDatasetKey,
    readonly diagnostics: ScanDiagnostic[],
  ) {
    super(`Required discovery dataset '${datasetKey}' is unavailable.`);
    this.name = 'UnavailableDiscoveryDatasetError';
  }
}

const groupResourcesByRegion = <T extends { region: string }>(resources: T[]): Map<string, T[]> => {
  const resourcesByRegion = new Map<string, T[]>();

  for (const resource of resources) {
    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push(resource);
    resourcesByRegion.set(resource.region, regionResources);
  }

  return resourcesByRegion;
};

const buildAccessDeniedDiagnosticMessage = (service: string, region: string, err: unknown): string =>
  `Skipped ${service} discovery in ${region} because access is denied by ${formatAwsAccessDeniedReason(err)}.`;

const buildDatasetFailureDiagnostic = (service: string, region: string | undefined, err: unknown): ScanDiagnostic => ({
  code: getAwsErrorCode(err),
  details: err instanceof Error ? err.message : String(err),
  message: isAwsThrottlingError(err)
    ? `Skipped ${service} discovery${region ? ` in ${region}` : ''} because AWS throttled the required dataset after retrying.`
    : `Skipped ${service} discovery${region ? ` in ${region}` : ''} because a required dataset failed to load.`,
  provider: 'aws',
  ...(region ? { region } : {}),
  service,
  source: 'discovery',
  status: isAwsThrottlingError(err) ? 'throttled' : 'error',
});

const buildCatalogFailureDiagnostic = (err: unknown): ScanDiagnostic => {
  const status = isAwsAccessDeniedError(err) ? 'access_denied' : isAwsThrottlingError(err) ? 'throttled' : 'error';
  const message =
    status === 'access_denied'
      ? `Skipped catalog-backed discovery because access to the Resource Explorer catalog is denied by ${formatAwsAccessDeniedReason(err)}; only account-scoped datasets were evaluated.`
      : status === 'throttled'
        ? 'Skipped catalog-backed discovery because AWS throttled the Resource Explorer catalog after retrying; only account-scoped datasets were evaluated.'
        : err instanceof AwsDiscoveryError
          ? `${err.message} Only account-scoped datasets were evaluated.`
          : 'Skipped catalog-backed discovery because the Resource Explorer catalog failed to load; only account-scoped datasets were evaluated.';

  return {
    code: getAwsErrorCode(err),
    details: err instanceof Error ? err.message : String(err),
    message,
    provider: 'aws',
    service: 'resource-explorer',
    source: 'discovery',
    status,
  };
};

const normalizeDatasetLoadResult = (
  loadResult: unknown[] | { diagnostics?: ScanDiagnostic[]; resources: unknown[]; unavailable?: boolean },
): { diagnostics: ScanDiagnostic[]; resources: unknown[]; unavailable: boolean } =>
  Array.isArray(loadResult)
    ? {
        diagnostics: [],
        resources: loadResult,
        unavailable: false,
      }
    : {
        diagnostics: loadResult.diagnostics ?? [],
        resources: loadResult.resources,
        unavailable: loadResult.unavailable ?? false,
      };

const formatElapsedMs = (startedAtMs: number): string => `${Math.max(0, Date.now() - startedAtMs)}ms`;

const buildResourcesByTypeIndex = (resources: AwsDiscoveredResource[]): Map<string, AwsDiscoveredResource[]> => {
  const resourcesByType = new Map<string, AwsDiscoveredResource[]>();

  for (const resource of resources) {
    const typedResources = resourcesByType.get(resource.resourceType) ?? [];
    typedResources.push(resource);
    resourcesByType.set(resource.resourceType, typedResources);
  }

  return resourcesByType;
};

const resolveAccountScopedDatasetRegion = async (target: AwsDiscoveryTarget): Promise<string> => {
  if (target.mode === 'region') {
    return assertValidAwsRegion(target.region);
  }

  if (target.mode === 'regions' && target.regions.length > 0) {
    return assertValidAwsRegion(target.regions[0] as string);
  }

  return resolveCurrentAwsRegion();
};

const buildEmptyLocalCatalog = async (searchRegion: string): Promise<AwsDiscoveryCatalog> => ({
  indexType: 'LOCAL',
  resources: [],
  searchRegion,
});

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
  options?: {
    debugLogger?: (message: string) => void;
    onProgress?: (event: AwsDiscoveryProgressEvent) => void;
  },
): Promise<LiveDiscoveryContext> => {
  const datasetKeys = collectDiscoveryDependencies(rules);
  emitDebugLog(
    options?.debugLogger,
    `aws: resolved discovery datasets ${datasetKeys.length === 0 ? 'none' : datasetKeys.join(', ')}`,
  );

  if (datasetKeys.length === 0) {
    return {
      catalog: await buildEmptyLocalCatalog(await resolveAccountScopedDatasetRegion(target)),
      diagnostics: [],
      resources: new LiveResourceBag(),
    };
  }

  const datasetDefinitions = resolveAwsDiscoveryDatasetDependencies(datasetKeys).map((datasetKey) => {
    const definition = getAwsDiscoveryDatasetDefinition(datasetKey);

    if (!definition) {
      throw new Error(`Unknown discovery dataset '${datasetKey}'.`);
    }

    return definition;
  });
  const resourceTypes = sortUnique(
    datasetDefinitions.flatMap((definition) => definition.resourceTypes.map(assertValidResourceExplorerResourceType)),
  );
  emitDebugLog(
    options?.debugLogger,
    `aws: resolved Resource Explorer resource types ${resourceTypes.length === 0 ? 'none' : resourceTypes.join(', ')}`,
  );
  let catalog: AwsDiscoveryCatalog;
  let catalogFailureDiagnostic: ScanDiagnostic | undefined;

  if (resourceTypes.length === 0) {
    catalog = await buildEmptyLocalCatalog(await resolveAccountScopedDatasetRegion(target));
  } else {
    try {
      catalog =
        options?.debugLogger === undefined
          ? await buildAwsDiscoveryCatalog(target, resourceTypes)
          : await buildAwsDiscoveryCatalog(target, resourceTypes, { debugLogger: options.debugLogger });
    } catch (err) {
      throwIfAwsExecutionAborted();
      const hasAccountScopedDatasets = datasetDefinitions.some((definition) => definition.resourceTypes.length === 0);

      // With no account-scoped datasets in the run, nothing can load without
      // the catalog, so the failure stays fatal and keeps its actionable error.
      if (!hasAccountScopedDatasets) {
        throw err;
      }

      emitDebugLog(
        options?.debugLogger,
        `aws: catalog build failed, degrading to account-scoped datasets: ${err instanceof Error ? err.message : String(err)}`,
      );
      catalogFailureDiagnostic = buildCatalogFailureDiagnostic(err);
      catalog = await buildEmptyLocalCatalog(await resolveAccountScopedDatasetRegion(target));
    }
  }
  emitDebugLog(
    options?.debugLogger,
    `aws: catalog ready with ${catalog.resources.length} resources from ${catalog.searchRegion}`,
  );

  if (resourceTypes.length > 0 && !catalogFailureDiagnostic) {
    options?.onProgress?.({
      kind: 'catalog',
      resourceCount: catalog.resources.length,
      searchRegion: catalog.searchRegion,
    });
  }
  const resourcesByType = buildResourcesByTypeIndex(catalog.resources);
  const catalogScope =
    isAwsEvidenceCacheEnabled() && resourceTypes.length > 0 && !catalogFailureDiagnostic
      ? await getAwsResourceExplorerEvidenceScope(target)
      : undefined;
  const datasetLoadPromises = new Map<string, Promise<AwsDiscoveryDatasetLoad>>();
  const loadedDatasetKeys = new Set<DiscoveryDatasetKey>();
  const unavailableRegions = new Map<DiscoveryDatasetKey, Set<string>>();
  let accountIdPromise: Promise<string> | undefined;
  const resolveAccountId = (): Promise<string> => (accountIdPromise ??= resolveAwsAccountId(catalog.searchRegion));
  const datasetRegion = await resolveAccountScopedDatasetRegion(target);
  const queryIdentity = (
    filterString: string,
    queryOptions?: { requiredViewProperties?: string[]; scope?: 'target' | 'account' },
  ) =>
    JSON.stringify([
      filterString,
      queryOptions?.scope ?? 'target',
      [...(queryOptions?.requiredViewProperties ?? [])].sort(),
    ]);
  const createLoadContext = (
    parentKey: DiscoveryDatasetKey,
    dependencies: Map<DiscoveryDatasetKey, AwsDiscoveryDatasetLoad>,
    queries: Map<string, AwsDiscoveredResource[]>,
    region?: string,
  ): AwsDiscoveryDatasetLoadContext => ({
    loadDataset: async <K extends DiscoveryDatasetKey>(datasetKey: K): Promise<DiscoveryDatasetMap[K]> => {
      if (!getAwsDiscoveryDatasetDefinition(parentKey)?.dependencies.includes(datasetKey)) {
        throw new Error(`Dataset '${parentKey}' attempted undeclared dependency '${datasetKey}'.`);
      }
      const result = dependencies.get(datasetKey);
      if (!result) throw new Error(`Dataset dependency '${datasetKey}' has not been resolved.`);
      if (result.unavailable) {
        throw new UnavailableDiscoveryDatasetError(datasetKey, result.unavailableDiagnostics ?? result.diagnostics);
      }
      return result.dataset[1] as DiscoveryDatasetMap[K];
    },
    listResourcesByFilter: async (filterString, filterOptions) => {
      const resources = queries.get(queryIdentity(filterString, filterOptions));
      if (!resources) throw new Error(`Dataset '${parentKey}' attempted an undeclared catalog query.`);
      return resources;
    },
    resolveAccountId,
    region: region ?? datasetRegion,
    ...(region
      ? { regions: [region] }
      : target.mode === 'all'
        ? {}
        : {
            regions: target.mode === 'regions' ? target.regions.map(assertValidAwsRegion) : [datasetRegion],
          }),
  });
  const loadDataset = <K extends DiscoveryDatasetKey>(
    datasetKey: K,
    requestedRegion?: string,
  ): Promise<AwsDiscoveryDatasetLoad<K>> => {
    throwIfAwsExecutionAborted();
    const definition = getAwsDiscoveryDatasetDefinition(datasetKey);
    if (!definition) throw new Error(`Unknown discovery dataset '${datasetKey}'.`);
    const accountScoped = definition.resourceTypes.length === 0;
    const region = accountScoped ? undefined : requestedRegion;
    const cacheKey = JSON.stringify([datasetKey, region]);
    const cachedLoad = datasetLoadPromises.get(cacheKey);
    if (cachedLoad) return cachedLoad as Promise<AwsDiscoveryDatasetLoad<K>>;
    loadedDatasetKeys.add(datasetKey);
    const startedAtMs = Date.now();
    const loadPromise = (async (): Promise<AwsDiscoveryDatasetLoad<K>> => {
      const result = (
        resources: unknown[],
        diagnostics: ScanDiagnostic[],
        unavailable: boolean,
        unavailableDiagnostics?: ScanDiagnostic[],
      ): AwsDiscoveryDatasetLoad<K> => ({
        dataset: [datasetKey, resources as DiscoveryDatasetMap[K]],
        diagnostics,
        unavailable,
        ...(unavailableDiagnostics?.length ? { unavailableDiagnostics } : {}),
      });
      if (!accountScoped && catalogFailureDiagnostic) return result([], [], true);
      const matchingResources = definition.resourceTypes.flatMap((type) => resourcesByType.get(type) ?? []);
      if (!accountScoped && region === undefined) {
        emitDebugLog(options?.debugLogger, `aws: loading dataset ${datasetKey}`);
        const groups = groupResourcesByRegion(matchingResources);
        const loads = await mapWithConcurrency([...groups.keys()], 5, (groupRegion) =>
          loadDataset(datasetKey, groupRegion),
        );
        const resources = loads.flatMap<unknown>((load) => load.dataset[1]);
        if (groups.size > 1 || loads.some((load) => load.unavailable))
          emitDebugLog(
            options?.debugLogger,
            `aws: completed dataset ${datasetKey} with ${resources.length} resources in ${formatElapsedMs(startedAtMs)}`,
          );
        return result(
          resources,
          loads.flatMap((load) => load.diagnostics),
          loads.length > 0 && loads.every((load) => load.unavailable),
          loads.flatMap((load) => load.unavailableDiagnostics ?? (load.unavailable ? load.diagnostics : [])),
        );
      }
      const regionResources = region ? matchingResources.filter((resource) => resource.region === region) : [];
      if (!accountScoped && regionResources.length === 0) return result([], [], false);
      let load: AwsDiscoveryDatasetLoad<K>;
      try {
        emitDebugLog(
          options?.debugLogger,
          `aws: loading dataset ${datasetKey}${region ? ` in ${region} from ${regionResources.length} resources` : ''}`,
        );
        const dependencyKeys = resolveAwsDiscoveryDatasetDependencies(definition.dependencies);
        const dependencyLoads = await Promise.all(dependencyKeys.map((key) => loadDataset(key, region)));
        const dependencies = new Map(dependencyLoads.map((dependency) => [dependency.dataset[0], dependency]));
        const unavailableDependency = dependencyLoads.find((dependency) => dependency.unavailable);
        if (unavailableDependency) {
          throw new UnavailableDiscoveryDatasetError(
            unavailableDependency.dataset[0],
            unavailableDependency.diagnostics,
          );
        }
        const queryLoads = await Promise.all(
          (definition.catalogQueries ?? []).map(async (query) => ({
            identity: queryIdentity(query.filterString, query),
            scope: isAwsEvidenceCacheEnabled()
              ? await getAwsResourceExplorerEvidenceScope(target, query.scope, query.requiredViewProperties)
              : undefined,
            resources: await listAwsResourcesByFilter(target, query.filterString, {
              scope: query.scope,
              requiredViewProperties: query.requiredViewProperties,
              ...(options?.debugLogger ? { debugLogger: options.debugLogger } : {}),
            }),
          })),
        );
        const queries = new Map(queryLoads.map((query) => [query.identity, query.resources]));
        const incompleteCatalog =
          getAwsEvidenceProvenance()?.some(
            (entry) =>
              !entry.complete &&
              (definition.resourceTypes.some((type) => entry.datasetKey === `catalog:${type}`) ||
                (queryLoads.length > 0 && entry.datasetKey === 'catalog:filter')),
          ) ?? false;
        const ttlMs = getAwsEvidenceTtl(datasetKey, definition.freshness.ttlMs);
        const runTimestamp = getAwsDiscoveryTimestamp();
        // Freeze rolling observations to a freshness bucket. The loader receives this exact timestamp,
        // so cache identity always describes its actual request interval.
        const observationTimestamp =
          isAwsEvidenceCacheEnabled() &&
          ttlMs > 0 &&
          definition.freshness.observation.kind === 'window' &&
          definition.freshness.observation.alignmentMs < ttlMs
            ? Math.floor(runTimestamp / ttlMs) * ttlMs
            : runTimestamp;
        const window = resolveAwsDiscoveryObservationWindow(definition.freshness.observation, observationTimestamp);
        const observationWindow = window ? { start: window.startTime, end: window.endTime } : undefined;
        const evidence = await loadAwsCachedEvidence({
          datasetKey,
          region,
          ttlMs,
          observationTimestamp,
          key: {
            datasetKey,
            region: region ?? datasetRegion,
            schemaVersion: definition.schemaVersion,
            loaderVersion: definition.loaderVersion,
            catalog: { scope: catalogScope, viewArn: catalog.viewArn, resources: regionResources, queries: queryLoads },
            observationWindow,
            dependencies: dependencyLoads.map((dependency) => [
              dependency.dataset[0],
              dependency.fingerprint ?? fingerprintAwsEvidence(dependency),
            ]),
          },
          load: async () => {
            const loaded = normalizeDatasetLoadResult(
              await definition.load(regionResources, createLoadContext(datasetKey, dependencies, queries, region)),
            );
            const coverage = assessAwsDiscoveryDatasetEvidence(
              datasetKey,
              {
                ...Object.fromEntries(dependencyLoads.map((dependency) => dependency.dataset)),
                [datasetKey]: loaded.resources,
              },
              {
                ...catalog,
                resources: region
                  ? catalog.resources.filter((resource) => resource.region === region)
                  : catalog.resources,
              },
            );
            const value = { ...result(loaded.resources, loaded.diagnostics, loaded.unavailable), coverage };
            return {
              value,
              complete:
                !loaded.unavailable &&
                !incompleteCatalog &&
                loaded.diagnostics.length === 0 &&
                coverage.unknown.length === 0 &&
                dependencyLoads.every(
                  (dependency) => !dependency.coverage?.unknown.length && dependency.diagnostics.length === 0,
                ),
              observedAt: observationWindow?.end ?? new Date(observationTimestamp).toISOString(),
              observationWindow,
            };
          },
          validate: (value): value is AwsDiscoveryDatasetLoad<K> =>
            !!value &&
            typeof value === 'object' &&
            'dataset' in value &&
            Array.isArray(value.dataset) &&
            value.dataset[0] === datasetKey &&
            Array.isArray(value.dataset[1]) &&
            'diagnostics' in value &&
            Array.isArray(value.diagnostics) &&
            'unavailable' in value &&
            value.unavailable === false,
        });
        load = {
          ...evidence.value,
          fingerprint: fingerprintAwsEvidence([
            definition.schemaVersion,
            definition.loaderVersion,
            observationWindow,
            evidence.fingerprint,
          ]),
        };
      } catch (err) {
        throwIfAwsExecutionAborted();
        emitDebugLog(
          options?.debugLogger,
          `aws: dataset ${datasetKey} failed${region ? ` in ${region}` : ''} after ${formatElapsedMs(startedAtMs)}: ${err instanceof Error ? err.message : String(err)}`,
        );
        if (err instanceof UnavailableDiscoveryDatasetError) {
          load = result([], [], true, err.diagnostics);
        } else if (region && isAwsAccessDeniedError(err)) {
          load = result(
            [],
            [
              {
                code: getAwsErrorCode(err),
                details: err instanceof Error ? err.message : String(err),
                message: buildAccessDeniedDiagnosticMessage(definition.service, region, err),
                provider: 'aws',
                region,
                service: definition.service,
                source: 'discovery',
                status: 'access_denied',
              },
            ],
            true,
          );
        } else {
          load = result([], [buildDatasetFailureDiagnostic(definition.service, region, err)], true);
        }
      }
      annotateAwsEvidence(datasetKey, region, { coverage: load.coverage, diagnostics: load.diagnostics });
      if (region && load.unavailable) {
        const failedRegions = unavailableRegions.get(datasetKey) ?? new Set<string>();
        failedRegions.add(region);
        unavailableRegions.set(datasetKey, failedRegions);
      }
      emitDebugLog(
        options?.debugLogger,
        `aws: completed dataset ${datasetKey}${region ? ` in ${region}` : ''} with ${load.dataset[1].length} resources in ${formatElapsedMs(startedAtMs)}`,
      );
      return load;
    })();
    datasetLoadPromises.set(cacheKey, loadPromise as Promise<AwsDiscoveryDatasetLoad>);
    return loadPromise;
  };
  // The public operation owns one budget spanning catalog and dataset loads.
  let completedDatasets = 0;
  const datasetLoads = await Promise.all(
    datasetKeys.map(async (datasetKey) => {
      const loadResult = await loadDataset(datasetKey);
      completedDatasets += 1;
      options?.onProgress?.({
        kind: 'dataset',
        completedDatasets,
        datasetKey,
        totalDatasets: datasetKeys.length,
      });
      return loadResult;
    }),
  );
  const allDatasetLoads = await Promise.all([...loadedDatasetKeys].map((key) => loadDataset(key)));
  const resources = new LiveResourceBag(
    Object.fromEntries(datasetLoads.map((loadResult) => loadResult.dataset)) as Partial<DiscoveryDatasetMap>,
  );
  const unavailableDatasets = new Map(
    allDatasetLoads
      .filter((loadResult) => loadResult.unavailable)
      .map(
        (loadResult) =>
          [
            loadResult.dataset[0],
            // Datasets skipped because the catalog never loaded carry no
            // diagnostics of their own; rule-skip messages inherit the
            // catalog failure details instead.
            catalogFailureDiagnostic && loadResult.diagnostics.length === 0
              ? [catalogFailureDiagnostic]
              : (loadResult.unavailableDiagnostics ?? loadResult.diagnostics),
          ] as const,
      ),
  );

  return {
    catalog,
    diagnostics: [
      ...(catalogFailureDiagnostic ? [catalogFailureDiagnostic] : []),
      ...allDatasetLoads.flatMap((loadResult) => loadResult.diagnostics),
    ],
    resources,
    unavailableDatasets,
    unavailableRegions,
  };
};

/**
 * Retrieves observed Resource Explorer status across all enabled AWS regions.
 *
 * @param region - Optional explicit region to use as the preferred control region.
 * @returns Observed discovery status across the account.
 */
export const getAwsDiscoveryStatus = async (
  region?: string,
  debugLogger?: (message: string) => void,
): Promise<AwsDiscoveryStatus> => {
  const selectedRegion = region ? assertValidAwsRegion(region) : await resolveCurrentAwsRegion();
  emitDebugLog(debugLogger, `aws: collecting discovery status from control region ${selectedRegion}`);
  const enabledRegions = await listEnabledAwsRegions(selectedRegion);
  emitDebugLog(debugLogger, `aws: inspecting discovery status across ${enabledRegions.length} enabled regions`);
  const statuses = await mapWithConcurrency(enabledRegions, 5, (enabledRegion) => {
    throwIfAwsExecutionAborted();
    return getAwsDiscoveryRegionStatus(enabledRegion);
  });
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
export const initializeAwsDiscovery = async (
  region?: string,
  debugLogger?: (message: string) => void,
): Promise<AwsDiscoveryInitialization> => {
  const explicitRegionRequested = region !== undefined;
  const selectedRegion = region ? assertValidAwsRegion(region) : await resolveCurrentAwsRegion();
  emitDebugLog(debugLogger, `aws: initializing discovery from control region ${selectedRegion}`);
  const observedStatus = await getAwsDiscoveryStatus(selectedRegion, debugLogger);
  const enabledRegions = await listEnabledAwsRegions(selectedRegion);
  emitDebugLog(debugLogger, `aws: found ${enabledRegions.length} enabled regions for initialization`);
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

    return finalizeInitializationResult({
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
      const updatedStatus = await getAwsDiscoveryStatus(selectedRegion, debugLogger);

      return finalizeInitializationResult({
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

      const updatedStatus = await getAwsDiscoveryStatus(selectedRegion, debugLogger);

      return finalizeInitializationResult({
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
      const updatedStatus = await getAwsDiscoveryStatus(selectedRegion, debugLogger);

      return finalizeInitializationResult({
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
    const updatedStatus = await getAwsDiscoveryStatus(selectedRegion, debugLogger);
    const localRegion =
      updatedStatus.regions.find((status) => status.region === selectedRegion && status.status === 'indexed')?.region ??
      selectedRegion;

    return finalizeInitializationResult({
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
  let updatedStatus = await getAwsDiscoveryStatus(selectedRegion, debugLogger);
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
        updatedStatus = await getAwsDiscoveryStatus(selectedRegion, debugLogger);
      } catch (err) {
        if (!isAwsAccessDeniedError(err)) {
          throw err;
        }

        return finalizeInitializationResult({
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

  return finalizeInitializationResult({
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
