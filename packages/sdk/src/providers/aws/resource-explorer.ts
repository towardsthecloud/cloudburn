import {
  CreateResourceExplorerSetupCommand,
  GetDefaultViewCommand,
  GetIndexCommand,
  GetResourceExplorerSetupCommand,
  GetViewCommand,
  type Index,
  ListIndexesCommand,
  ListResourcesCommand,
  ListSupportedResourceTypesCommand,
  type Resource,
  type ResourceProperty,
  type SupportedResourceType,
  UpdateIndexTypeCommand,
  UpdateViewCommand,
  type View,
} from '@aws-sdk/client-resource-explorer-2';
import type { AwsDiscoveredResource, AwsDiscoveryCatalog } from '@cloudburn/rules';
import { emitDebugLog } from '../../debug.js';
import type {
  AwsDiscoveryRegion,
  AwsDiscoveryRegionStatus,
  AwsDiscoveryTarget,
  AwsSupportedResourceType,
} from '../../types.js';
import {
  type AwsRegion,
  assertValidAwsRegion,
  createResourceExplorerClient,
  listEnabledAwsRegions,
  resolveCurrentAwsRegion,
} from './client.js';
import {
  AwsDiscoveryError,
  isAwsAccessDeniedError,
  RESOURCE_EXPLORER_SETUP_DOCS_URL,
  wrapAwsServiceError,
} from './errors.js';
import { mapWithConcurrency, withAwsServiceErrorContext } from './resources/utils.js';

const DEFAULT_RESOURCE_EXPLORER_VIEW_NAME = 'cloudburn-default';
const TERMINAL_OPERATION_STATUSES = new Set(['FAILED', 'SKIPPED', 'SUCCEEDED']);
const RESOURCE_EXPLORER_FILTER_STRING_MAX_LENGTH = 2048;
const RESOURCE_EXPLORER_LIST_RESOURCES_INITIAL_DELAY_MS = 250;
const RESOURCE_EXPLORER_LIST_RESOURCES_MAX_ATTEMPTS = 5;
const RESOURCE_EXPLORER_LIST_RESOURCES_MAX_RESULTS = 999;
const RESOURCE_EXPLORER_REGION_CONCURRENCY = 5;

type SearchPlan = {
  searchRegion: string;
  indexType: 'LOCAL' | 'AGGREGATOR';
  regionFilters?: AwsRegion[];
};

type ListResourcesQueryPlan = {
  resourceTypes: string[];
  regionFilters?: AwsRegion[];
};

type AggregatorLookupResult =
  | {
      kind: 'ok';
      indexes: AwsDiscoveryRegion[];
    }
  | {
      kind: 'skipped';
    };

type AccessibleAggregatorLookup = {
  aggregatorRegion?: string;
  accessibleIndexedRegions: string[];
  sawDeniedRegion: boolean;
};

type AwsResourceExplorerIndexDetails = {
  arn: string;
  region: string;
  state?: string;
  type: 'local' | 'aggregator';
};

type CreateResourceExplorerSetupOptions = {
  region: string;
  regions: string[];
  aggregatorRegion?: string;
};

const isUnsupportedRegionError = (err: unknown): boolean => {
  if (!(err instanceof Error)) {
    return false;
  }

  const error = err as Error & { code?: string };
  const candidates = [err.name, error.code, err.message]
    .filter((value): value is string => value !== undefined)
    .map((value) => value.toLowerCase());

  return candidates.some(
    (value) =>
      value.includes('unknownendpoint') ||
      value.includes('unsupported') ||
      value.includes('region is disabled') ||
      value.includes('could not resolve endpoint'),
  );
};

const getErrorCode = (err: unknown): string | undefined => {
  if (!(err instanceof Error)) {
    return undefined;
  }

  const error = err as Error & { code?: string };
  return error.code ?? err.name;
};

const getErrorMessage = (err: unknown, fallback: string): string => {
  if (!(err instanceof Error)) {
    return fallback;
  }

  return err.message.trim() || fallback;
};

const isResourceNotFoundError = (err: unknown): boolean => {
  if (!(err instanceof Error)) {
    return false;
  }

  const error = err as Error & { code?: string };
  const candidates = [err.name, error.code, err.message]
    .filter((value): value is string => value !== undefined)
    .map((value) => value.toLowerCase());

  return candidates.some((value) => value.includes('resourcenotfound') || value.includes('not found'));
};

const sleep = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

const throwResourceExplorerOperationError = (err: unknown, operation: string, region: string): never => {
  if (err instanceof AwsDiscoveryError) {
    throw err;
  }

  throw wrapAwsServiceError(err, 'AWS Resource Explorer', operation, region);
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

  const namedResource = resource as Resource & { Name?: string };

  return {
    arn: resource.Arn,
    accountId: resource.OwningAccountId,
    name: namedResource.Name,
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

const listIndexesForRegion = async (region: string, regions?: string[]): Promise<AwsDiscoveryRegion[]> => {
  const validRegion = assertValidAwsRegion(region);
  const client = createResourceExplorerClient({ region: validRegion });
  const normalizedRegions = regions?.map((value) => assertValidAwsRegion(value));
  const indexes: AwsDiscoveryRegion[] = [];
  let nextToken: string | undefined;

  do {
    const response = await client.send(
      new ListIndexesCommand({
        NextToken: nextToken,
        ...(normalizedRegions ? { Regions: normalizedRegions } : {}),
      }),
    );
    const mapped = (response.Indexes ?? []).flatMap((index) => {
      const normalized = mapIndex(index);
      return normalized ? [normalized] : [];
    });

    indexes.push(...mapped);
    nextToken = response.NextToken;
  } while (nextToken);

  return indexes.sort((left, right) => left.region.localeCompare(right.region));
};

const getAwsResourceExplorerIndex = async (region: string): Promise<AwsResourceExplorerIndexDetails | null> => {
  const validRegion = assertValidAwsRegion(region);
  const client = createResourceExplorerClient({ region: validRegion });
  let response: {
    Arn?: string;
    State?: string;
    Type?: 'AGGREGATOR' | 'LOCAL';
  } | null = null;

  try {
    response = await client.send(new GetIndexCommand({}));
  } catch (err: unknown) {
    if (isResourceNotFoundError(err)) {
      return null;
    }

    throwResourceExplorerOperationError(err, 'GetIndex', validRegion);
  }

  if (!response?.Arn || !response.Type) {
    return null;
  }

  return {
    arn: response.Arn,
    region: validRegion,
    state: response.State,
    type: response.Type === 'AGGREGATOR' ? 'aggregator' : 'local',
  };
};

const resolveRegionalSearchPlan = async (requestedRegion: string): Promise<SearchPlan> => {
  const validRequestedRegion = assertValidAwsRegion(requestedRegion);
  const requestedIndexes = await listIndexesForRegion(validRequestedRegion, [validRequestedRegion]).catch(
    (err: unknown) => throwResourceExplorerOperationError(err, 'ListIndexes', validRequestedRegion),
  );

  const requestedIndex = requestedIndexes.find((index) => index.region === validRequestedRegion);

  if (!requestedIndex) {
    throw new AwsDiscoveryError(
      'RESOURCE_EXPLORER_REGION_NOT_ENABLED',
      `AWS Resource Explorer is not enabled in ${validRequestedRegion}. Enable it first: ${RESOURCE_EXPLORER_SETUP_DOCS_URL} or run 'cloudburn discover init'.`,
    );
  }

  if (requestedIndex.type === 'local') {
    const { aggregatorRegion } = await findAccessibleAggregatorRegion();

    if (aggregatorRegion) {
      return {
        searchRegion: aggregatorRegion,
        indexType: 'AGGREGATOR',
        regionFilters: [validRequestedRegion],
      };
    }
  }

  return {
    searchRegion: validRequestedRegion,
    indexType: requestedIndex.type === 'aggregator' ? 'AGGREGATOR' : 'LOCAL',
    regionFilters: [validRequestedRegion],
  };
};

const listIndexesForAggregatorLookup = async (region: string): Promise<AggregatorLookupResult> => {
  try {
    return {
      kind: 'ok',
      indexes: await listIndexesForRegion(region, [region]),
    };
  } catch (err: unknown) {
    if (isAwsAccessDeniedError(err) || isUnsupportedRegionError(err)) {
      return { kind: 'skipped' };
    }

    if (err instanceof AwsDiscoveryError) {
      throw err;
    }

    throw wrapAwsServiceError(err, 'AWS Resource Explorer', 'ListIndexes', region);
  }
};

const findAccessibleAggregatorRegion = async (): Promise<AccessibleAggregatorLookup> => {
  const enabledRegions = await listEnabledAwsRegions();
  const accessibleIndexedRegions: string[] = [];
  let aggregatorRegion: string | undefined;
  let sawDeniedRegion = false;
  const lookups = await mapWithConcurrency(enabledRegions, RESOURCE_EXPLORER_REGION_CONCURRENCY, async (region) => ({
    region,
    lookup: await listIndexesForAggregatorLookup(region),
  }));

  for (const { region, lookup } of lookups) {
    if (lookup.kind === 'skipped') {
      sawDeniedRegion = true;
      continue;
    }

    const matchingIndex = lookup.indexes.find((index) => index.region === region);

    if (matchingIndex) {
      accessibleIndexedRegions.push(matchingIndex.region);
    }

    const aggregator = lookup.indexes.find((index) => index.type === 'aggregator');

    if (aggregator && !aggregatorRegion) {
      aggregatorRegion = aggregator.region;
    }
  }

  return {
    aggregatorRegion,
    accessibleIndexedRegions,
    sawDeniedRegion,
  };
};

const requireAccessibleAggregator = async (messages: {
  denied: string;
  missing: string;
}): Promise<AccessibleAggregatorLookup & { aggregatorRegion: string }> => {
  const lookup = await findAccessibleAggregatorRegion();

  if (lookup.aggregatorRegion) {
    return { ...lookup, aggregatorRegion: lookup.aggregatorRegion };
  }

  throw new AwsDiscoveryError(
    'RESOURCE_EXPLORER_AGGREGATOR_REQUIRED',
    lookup.sawDeniedRegion ? messages.denied : messages.missing,
  );
};

const sortUniqueStrings = <T extends string>(values: T[]): T[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right)) as T[];

const resolveAggregatorSearchPlan = async (requestedRegions?: AwsRegion[]): Promise<SearchPlan> => {
  const { accessibleIndexedRegions, aggregatorRegion } = await requireAccessibleAggregator({
    denied:
      "Cross-region discovery requires an accessible aggregator index. CloudBurn only searches regions that are indexed and permitted in AWS Resource Explorer. Run 'cloudburn discover status' to inspect indexed regions and access restrictions.",
    missing:
      "Cross-region discovery requires an aggregator index. Enable one first with 'cloudburn discover init' or the AWS console.",
  });
  const selectedRegions: AwsRegion[] = requestedRegions
    ? sortUniqueStrings(requestedRegions)
    : (accessibleIndexedRegions as AwsRegion[]);

  const missingRegions = selectedRegions.filter((region) => !accessibleIndexedRegions.includes(region));

  if (missingRegions.length > 0) {
    throw new AwsDiscoveryError(
      'RESOURCE_EXPLORER_REGION_NOT_ENABLED',
      `AWS Resource Explorer is not enabled in ${missingRegions[0]}. Enable it first: ${RESOURCE_EXPLORER_SETUP_DOCS_URL} or run 'cloudburn discover init'.`,
    );
  }

  return {
    searchRegion: aggregatorRegion,
    indexType: 'AGGREGATOR',
    regionFilters: selectedRegions,
  };
};

const resolveAccountSearchPlan = async (): Promise<SearchPlan> => {
  const { aggregatorRegion } = await requireAccessibleAggregator({
    denied:
      "Account-wide discovery requires an accessible aggregator index. Run 'cloudburn discover status' to inspect indexed regions and access restrictions.",
    missing:
      "Account-wide discovery requires an aggregator index. Enable one first with 'cloudburn discover init' or the AWS console.",
  });

  return {
    searchRegion: aggregatorRegion,
    indexType: 'AGGREGATOR',
  };
};

const buildFilterString = (resourceTypes: string[], regionFilters?: AwsRegion[]): string => {
  const normalizedResourceTypes = sortUniqueStrings(resourceTypes);

  if (normalizedResourceTypes.length === 0) {
    throw new Error('At least one Resource Explorer resource type is required.');
  }

  const segments = [`resourcetype:${normalizedResourceTypes.join(',')}`];

  if (regionFilters && regionFilters.length > 0) {
    segments.push(`region:${sortUniqueStrings(regionFilters).map(assertValidAwsRegion).join(',')}`);
  }

  return segments.join(' ');
};

const chunkValuesByFilterLength = <T extends string>(values: T[], buildCandidate: (batch: T[]) => string): T[][] => {
  const batches: T[][] = [];
  let currentBatch: T[] = [];

  for (const value of values) {
    const nextBatch = [...currentBatch, value];

    if (buildCandidate(nextBatch).length <= RESOURCE_EXPLORER_FILTER_STRING_MAX_LENGTH) {
      currentBatch = nextBatch;
      continue;
    }

    if (currentBatch.length === 0) {
      throw new Error(`Resource Explorer filter value '${value}' exceeds the maximum filter length.`);
    }

    batches.push(currentBatch);
    currentBatch = [value];
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
};

const planListResourcesQueries = (resourceTypes: string[], regionFilters?: AwsRegion[]): ListResourcesQueryPlan[] => {
  const normalizedResourceTypes = sortUniqueStrings(resourceTypes);
  const normalizedRegionFilters = regionFilters ? (sortUniqueStrings(regionFilters) as AwsRegion[]) : undefined;

  if (!normalizedRegionFilters || normalizedRegionFilters.length === 0) {
    return chunkValuesByFilterLength(normalizedResourceTypes, (resourceTypeBatch) =>
      buildFilterString(resourceTypeBatch),
    ).map((resourceTypeBatch) => ({
      resourceTypes: resourceTypeBatch,
    }));
  }

  let regionBatches: AwsRegion[][];

  try {
    regionBatches = chunkValuesByFilterLength(normalizedRegionFilters, (regionBatch) =>
      buildFilterString(normalizedResourceTypes, regionBatch),
    );
  } catch {
    regionBatches = normalizedRegionFilters.map((region) => [region]);
  }

  return regionBatches.flatMap((regionBatch) => {
    if (buildFilterString(normalizedResourceTypes, regionBatch).length <= RESOURCE_EXPLORER_FILTER_STRING_MAX_LENGTH) {
      return [
        {
          resourceTypes: normalizedResourceTypes,
          regionFilters: regionBatch,
        } satisfies ListResourcesQueryPlan,
      ];
    }

    return chunkValuesByFilterLength(normalizedResourceTypes, (resourceTypeBatch) =>
      buildFilterString(resourceTypeBatch, regionBatch),
    ).map((resourceTypeBatch) => ({
      resourceTypes: resourceTypeBatch,
      regionFilters: regionBatch,
    }));
  });
};

const getDefaultResourceExplorerView = async (
  searchRegion: string,
): Promise<{
  client: ReturnType<typeof createResourceExplorerClient>;
  view: View | undefined;
  viewArn: string;
}> => {
  const client = createResourceExplorerClient({ region: searchRegion });
  const defaultViewResponse = await client
    .send(new GetDefaultViewCommand({}))
    .catch((err: unknown) => throwResourceExplorerOperationError(err, 'GetDefaultView', searchRegion));
  const viewArn = defaultViewResponse.ViewArn;

  if (!viewArn) {
    throw new AwsDiscoveryError(
      'RESOURCE_EXPLORER_DEFAULT_VIEW_REQUIRED',
      `AWS Resource Explorer does not have a default view in ${searchRegion}. Create one with 'cloudburn discover init' or configure a default view in the AWS console.`,
    );
  }

  const viewResponse = await client
    .send(
      new GetViewCommand({
        ViewArn: viewArn,
      }),
    )
    .catch((err: unknown) => throwResourceExplorerOperationError(err, 'GetView', searchRegion));

  return { client, view: viewResponse.View, viewArn };
};

const getIncludedPropertyNames = (view: View | undefined): Set<string> =>
  new Set((view?.IncludedProperties ?? []).flatMap((property) => (property.Name ? [property.Name] : [])));

const resolveSearchViewArn = async (searchRegion: string, requiredProperties: string[] = []): Promise<string> => {
  const { view, viewArn } = await getDefaultResourceExplorerView(searchRegion);
  const filterString = view?.Filters?.FilterString?.trim();

  if (filterString) {
    throw new AwsDiscoveryError(
      'RESOURCE_EXPLORER_FILTERED_VIEW_UNSUPPORTED',
      `The default AWS Resource Explorer view in ${searchRegion} applies additional filters and can hide resources from discovery. Use 'cloudburn discover init' or configure an unfiltered default view first.`,
    );
  }

  const includedProperties = getIncludedPropertyNames(view);
  const missingProperty = requiredProperties.find((property) => !includedProperties.has(property));

  if (missingProperty) {
    throw new AwsDiscoveryError(
      'RESOURCE_EXPLORER_TAGS_VIEW_REQUIRED',
      `The default AWS Resource Explorer view in ${searchRegion} does not include the '${missingProperty}' property required for tagging discovery. Run 'cloudburn discover init' to update the view.`,
    );
  }

  return viewArn;
};

const resolveSearchPlan = async (target: AwsDiscoveryTarget): Promise<SearchPlan> => {
  if (target.mode === 'regions') {
    if (target.regions.length === 1) {
      const [requestedRegion] = target.regions;
      return resolveRegionalSearchPlan(assertValidAwsRegion(requestedRegion));
    }

    return resolveAggregatorSearchPlan(target.regions);
  }

  if (target.mode === 'region') {
    return resolveRegionalSearchPlan(assertValidAwsRegion(target.region));
  }

  if (target.mode === 'all') {
    return resolveAggregatorSearchPlan();
  }

  return resolveRegionalSearchPlan(await resolveCurrentAwsRegion());
};

const buildScopedFilterString = (filterString: string, regionFilters?: AwsRegion[]): string => {
  const normalizedFilter = filterString.trim();

  if (!normalizedFilter) {
    throw new Error('A Resource Explorer filter string is required.');
  }

  const segments = [normalizedFilter];

  if (regionFilters && regionFilters.length > 0) {
    segments.push(`region:${sortUniqueStrings(regionFilters).map(assertValidAwsRegion).join(',')}`);
  }

  const scopedFilter = segments.join(' ');

  if (scopedFilter.length > RESOURCE_EXPLORER_FILTER_STRING_MAX_LENGTH) {
    throw new Error('Resource Explorer filter string exceeds the maximum filter length.');
  }

  return scopedFilter;
};

const planScopedFilters = (filterString: string, regionFilters?: AwsRegion[]): string[] => {
  const normalizedRegions = regionFilters ? (sortUniqueStrings(regionFilters) as AwsRegion[]) : [];

  if (normalizedRegions.length === 0) {
    return [buildScopedFilterString(filterString)];
  }

  return chunkValuesByFilterLength(normalizedRegions, (regionBatch) =>
    buildScopedFilterString(filterString, regionBatch),
  ).map((regionBatch) => buildScopedFilterString(filterString, regionBatch));
};

/**
 * Lists all AWS Resource Explorer index regions visible to the current account.
 *
 * @param controlRegion - Optional region whose Resource Explorer control plane should be queried.
 * @returns Enabled local and aggregator index regions.
 */
export const listAwsDiscoveryIndexes = async (controlRegion?: string): Promise<AwsDiscoveryRegion[]> => {
  const currentRegion = controlRegion ? assertValidAwsRegion(controlRegion) : await resolveCurrentAwsRegion();

  return listIndexesForRegion(currentRegion);
};

/**
 * Inspects the observed Resource Explorer state for a single AWS region.
 *
 * @param region - Region to inspect.
 * @returns The observed per-region discovery status.
 */
export const getAwsDiscoveryRegionStatus = async (region: string): Promise<AwsDiscoveryRegionStatus> => {
  const validRegion = assertValidAwsRegion(region);
  const client = createResourceExplorerClient({ region: validRegion });

  try {
    const response = await client.send(
      new ListIndexesCommand({
        Regions: [validRegion],
      }),
    );
    const matchedIndex = (response.Indexes ?? [])
      .flatMap((index) => {
        const normalized = mapIndex(index);
        return normalized ? [normalized] : [];
      })
      .find((index) => index.region === validRegion);

    if (!matchedIndex) {
      return {
        region: validRegion,
        status: 'not_indexed',
      };
    }

    try {
      const defaultViewResponse = await client.send(new GetDefaultViewCommand({}));
      const viewArn = defaultViewResponse.ViewArn;

      if (!viewArn) {
        return {
          region: validRegion,
          indexType: matchedIndex.type,
          isAggregator: matchedIndex.type === 'aggregator',
          status: 'indexed',
          viewStatus: 'missing',
          notes: 'Default view is missing in this region.',
        };
      }

      const viewResponse = await client.send(
        new GetViewCommand({
          ViewArn: viewArn,
        }),
      );
      const filterString = viewResponse.View?.Filters?.FilterString?.trim();

      if (filterString) {
        return {
          region: validRegion,
          indexType: matchedIndex.type,
          isAggregator: matchedIndex.type === 'aggregator',
          status: 'indexed',
          viewStatus: 'filtered',
          notes: 'Default view is filtered and may hide resources.',
        };
      }

      return {
        region: validRegion,
        indexType: matchedIndex.type,
        isAggregator: matchedIndex.type === 'aggregator',
        status: 'indexed',
        viewStatus: 'present',
      };
    } catch (err) {
      return {
        region: validRegion,
        indexType: matchedIndex.type,
        isAggregator: matchedIndex.type === 'aggregator',
        status: 'indexed',
        viewStatus: isAwsAccessDeniedError(err) ? 'access_denied' : 'error',
        errorCode: getErrorCode(err),
        notes: getErrorMessage(err, 'Unable to inspect the default view in this region.'),
      };
    }
  } catch (err) {
    if (isAwsAccessDeniedError(err)) {
      return {
        region: validRegion,
        status: 'access_denied',
        errorCode: getErrorCode(err),
        notes: getErrorMessage(err, 'Access denied while inspecting this region.'),
      };
    }

    if (isUnsupportedRegionError(err)) {
      return {
        region: validRegion,
        status: 'unsupported',
        errorCode: getErrorCode(err),
        notes: getErrorMessage(err, 'Resource Explorer is not supported in this region.'),
      };
    }

    return {
      region: validRegion,
      status: 'error',
      errorCode: getErrorCode(err),
      notes: getErrorMessage(err, 'Unable to inspect this region.'),
    };
  }
};

/**
 * Polls an AWS Resource Explorer setup task until the service reports terminal region states or times out.
 *
 * @param taskId - Task identifier returned by CreateResourceExplorerSetup.
 * @param region - Region from which to query task state.
 * @param maxAttempts - Maximum polling attempts before timing out.
 * @param delayMs - Delay between polling attempts in milliseconds.
 * @returns Whether the task reached terminal state inside the polling window.
 */
export const waitForAwsResourceExplorerSetup = async (
  taskId: string,
  region: string,
  maxAttempts = 10,
  delayMs = 3000,
): Promise<'verified' | 'timed_out'> => {
  const validRegion = assertValidAwsRegion(region);
  const client = createResourceExplorerClient({ region: validRegion });

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const statuses: string[] = [];
    let nextToken: string | undefined;

    do {
      const response = await client.send(
        new GetResourceExplorerSetupCommand({
          NextToken: nextToken,
          TaskId: taskId,
        }),
      );

      for (const regionStatus of response.Regions ?? []) {
        if (regionStatus.Index?.Status) {
          statuses.push(regionStatus.Index.Status);
        }
        if (regionStatus.View?.Status) {
          statuses.push(regionStatus.View.Status);
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);

    if (statuses.length > 0 && statuses.every((status) => TERMINAL_OPERATION_STATUSES.has(status))) {
      return 'verified';
    }

    if (attempt < maxAttempts - 1) {
      await sleep(delayMs);
    }
  }

  return 'timed_out';
};

const listResourceExplorerResources = async (options: {
  debugLogger?: (message: string) => void;
  filters: string[];
  queryLabel?: string;
  searchRegion: string;
  viewArn: string;
}): Promise<AwsDiscoveredResource[]> => {
  const client = createResourceExplorerClient({ region: options.searchRegion });
  const resourcesByArn = new Map<string, AwsDiscoveredResource>();
  const queryLabel = options.queryLabel ? `${options.queryLabel} ` : '';

  for (const [queryIndex, filterString] of options.filters.entries()) {
    let nextToken: string | undefined;
    let page = 1;

    do {
      emitDebugLog(
        options.debugLogger,
        `aws: Resource Explorer ${queryLabel}query ${queryIndex + 1}/${options.filters.length} page ${page} filter="${filterString}"`,
      );
      const response = await withAwsServiceErrorContext(
        'AWS Resource Explorer',
        'ListResources',
        options.searchRegion,
        () =>
          client.send(
            new ListResourcesCommand({
              Filters: { FilterString: filterString },
              MaxResults: RESOURCE_EXPLORER_LIST_RESOURCES_MAX_RESULTS,
              NextToken: nextToken,
              ViewArn: options.viewArn,
            }),
          ),
        {
          initialDelayMs: RESOURCE_EXPLORER_LIST_RESOURCES_INITIAL_DELAY_MS,
          maxAttempts: RESOURCE_EXPLORER_LIST_RESOURCES_MAX_ATTEMPTS,
          onRetry: ({ attempt, delayMs, maxAttempts }) => {
            emitDebugLog(
              options.debugLogger,
              `aws: retrying throttled Resource Explorer ListResources attempt ${attempt + 1}/${maxAttempts} after ${delayMs}ms`,
            );
          },
        },
      );

      for (const resource of response.Resources ?? []) {
        const normalized = mapResource(resource);

        if (normalized) {
          resourcesByArn.set(normalized.arn, normalized);
        }
      }

      nextToken = response.NextToken;
      page += 1;
    } while (nextToken);
  }

  return [...resourcesByArn.values()].sort((left, right) => left.arn.localeCompare(right.arn));
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
  options?: { debugLogger?: (message: string) => void },
): Promise<AwsDiscoveryCatalog> => {
  const searchPlan = await resolveSearchPlan(target);
  emitDebugLog(
    options?.debugLogger,
    `aws: Resource Explorer using ${searchPlan.indexType.toLowerCase()} control plane ${searchPlan.searchRegion}${
      searchPlan.regionFilters ? ` for regions ${searchPlan.regionFilters.join(', ')}` : ''
    }`,
  );
  const viewArn = await resolveSearchViewArn(searchPlan.searchRegion);
  const queryPlans = planListResourcesQueries(resourceTypes, searchPlan.regionFilters);
  emitDebugLog(
    options?.debugLogger,
    `aws: planned ${queryPlans.length} Resource Explorer quer${queryPlans.length === 1 ? 'y' : 'ies'} for ${resourceTypes.length} resource types`,
  );

  const resources = await listResourceExplorerResources({
    debugLogger: options?.debugLogger,
    filters: queryPlans.map((queryPlan) => buildFilterString(queryPlan.resourceTypes, queryPlan.regionFilters)),
    searchRegion: searchPlan.searchRegion,
    viewArn,
  });

  emitDebugLog(options?.debugLogger, `aws: Resource Explorer catalog collected ${resources.length} unique resources`);

  return {
    resources,
    searchRegion: searchPlan.searchRegion,
    indexType: searchPlan.indexType,
    viewArn,
  };
};

/**
 * Lists normalized AWS resources that match an arbitrary Resource Explorer filter.
 *
 * @param target - Discovery target controlling current-region, explicit-region, or all-region behavior.
 * @param filterString - Resource Explorer filter expression applied to every query.
 * @param options - Optional required view properties and debug logger.
 * @returns Deduplicated resources sorted by ARN.
 */
export const listAwsResourcesByFilter = async (
  target: AwsDiscoveryTarget,
  filterString: string,
  options?: {
    requiredViewProperties?: string[];
    debugLogger?: (message: string) => void;
    scope?: 'target' | 'account';
  },
): Promise<AwsDiscoveredResource[]> => {
  const searchPlan = options?.scope === 'account' ? await resolveAccountSearchPlan() : await resolveSearchPlan(target);
  const viewArn = await resolveSearchViewArn(searchPlan.searchRegion, options?.requiredViewProperties);
  const scopedFilters = planScopedFilters(filterString, searchPlan.regionFilters);

  return listResourceExplorerResources({
    debugLogger: options?.debugLogger,
    filters: scopedFilters,
    queryLabel: 'filtered',
    searchRegion: searchPlan.searchRegion,
    viewArn,
  });
};

/**
 * Ensures the default Resource Explorer view exposes tag data for tag-aware filters.
 *
 * @param region - Resource Explorer control region containing the default view.
 * @returns Nothing after the view is already compliant or has been updated.
 */
export const ensureAwsResourceExplorerDefaultViewIncludesTags = async (region: string): Promise<void> => {
  const validRegion = assertValidAwsRegion(region);
  const { client, view, viewArn } = await getDefaultResourceExplorerView(validRegion);
  const includedPropertyNames = getIncludedPropertyNames(view);

  if (includedPropertyNames.has('tags')) {
    return;
  }

  includedPropertyNames.add('tags');
  await client
    .send(
      new UpdateViewCommand({
        IncludedProperties: [...includedPropertyNames]
          .sort((left, right) => left.localeCompare(right))
          .map((name) => ({ Name: name })),
        ViewArn: viewArn,
      }),
    )
    .catch((err: unknown) => throwResourceExplorerOperationError(err, 'UpdateView', validRegion));
};

/**
 * Creates a Resource Explorer setup across the supplied AWS regions.
 *
 * @param options - Setup options describing the primary region, enabled regions, and optional aggregator region.
 * @returns Setup metadata for the created task.
 */
export const createAwsResourceExplorerSetup = async (
  options: CreateResourceExplorerSetupOptions,
): Promise<{
  aggregatorRegion: string;
  indexType: 'local' | 'aggregator';
  regions: string[];
  status: 'CREATED';
  taskId?: string;
}> => {
  const setupRegion = assertValidAwsRegion(options.region);
  const validAggregatorRegion = options.aggregatorRegion ? assertValidAwsRegion(options.aggregatorRegion) : undefined;
  const normalizedRegions = [
    ...new Set(
      [...options.regions, setupRegion, ...(validAggregatorRegion ? [validAggregatorRegion] : [])].map((region) =>
        assertValidAwsRegion(region),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const client = createResourceExplorerClient({ region: setupRegion });
  const response = await client.send(
    new CreateResourceExplorerSetupCommand({
      ...(validAggregatorRegion ? { AggregatorRegions: [validAggregatorRegion] } : {}),
      RegionList: normalizedRegions,
      ViewName: DEFAULT_RESOURCE_EXPLORER_VIEW_NAME,
    }),
  );

  return {
    aggregatorRegion: validAggregatorRegion ?? setupRegion,
    indexType: validAggregatorRegion ? 'aggregator' : 'local',
    regions: normalizedRegions,
    status: 'CREATED',
    taskId: response.TaskId,
  };
};

/**
 * Updates the type of the Resource Explorer index in a single AWS region.
 *
 * @param region - Region whose existing index should change type.
 * @param type - Desired index type.
 * @returns Updated index metadata after the type change request starts.
 */
export const updateAwsResourceExplorerIndexType = async (
  region: string,
  type: 'local' | 'aggregator',
): Promise<Pick<AwsResourceExplorerIndexDetails, 'region' | 'state' | 'type'>> => {
  const validRegion = assertValidAwsRegion(region);
  const index = await getAwsResourceExplorerIndex(validRegion);

  if (!index) {
    throw new AwsDiscoveryError(
      'RESOURCE_EXPLORER_REGION_NOT_ENABLED',
      `AWS Resource Explorer is not enabled in ${validRegion}. Enable it first: ${RESOURCE_EXPLORER_SETUP_DOCS_URL} or run 'cloudburn discover init'.`,
    );
  }

  const client = createResourceExplorerClient({ region: validRegion });
  const response = await client
    .send(
      new UpdateIndexTypeCommand({
        Arn: index.arn,
        Type: type === 'aggregator' ? 'AGGREGATOR' : 'LOCAL',
      }),
    )
    .catch((err: unknown) => throwResourceExplorerOperationError(err, 'UpdateIndexType', validRegion));

  return {
    region: validRegion,
    state: response.State,
    type: response.Type === 'AGGREGATOR' ? 'aggregator' : 'local',
  };
};

/**
 * Polls a single Resource Explorer index until it reaches the ACTIVE state or times out.
 *
 * @param region - Region whose index should be polled.
 * @param maxAttempts - Maximum polling attempts before timing out.
 * @param delayMs - Delay between polling attempts in milliseconds.
 * @returns Whether the index reached ACTIVE inside the polling window.
 */
export const waitForAwsResourceExplorerIndex = async (
  region: string,
  maxAttempts = 20,
  delayMs = 3000,
): Promise<'verified' | 'timed_out'> => {
  const validRegion = assertValidAwsRegion(region);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const index = await getAwsResourceExplorerIndex(validRegion);

    if (index?.state === 'ACTIVE') {
      return 'verified';
    }

    if (attempt < maxAttempts - 1) {
      await sleep(delayMs);
    }
  }

  return 'timed_out';
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
