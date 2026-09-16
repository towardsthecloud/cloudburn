import type { DiscoveryDatasetKey, DiscoveryDatasetMap, LiveEvaluationCoverage } from '@cloudburn/rules';
import { getAwsDatasetCapability, isRecord } from '@cloudburn/rules';
import type {
  AwsCapability,
  AwsCapabilityOutcome,
  AwsCapabilityReason,
  AwsCapabilityStatus,
  ScanDiagnostic,
} from '../../types.js';

/** Finalized evidence observed for one discovery dataset during a live scan. */
export type AwsCapabilityDatasetObservation = {
  datasetKey: DiscoveryDatasetKey;
  unavailable: boolean;
  diagnostics: ScanDiagnostic[];
  coverage?: LiveEvaluationCoverage;
  unavailableRegions?: string[];
  /** Set when a catalog-backed dataset matched no resources, so no service call ran. */
  notAssessed?: boolean;
  /** Set when persisted evidence provenance marks the dataset entry incomplete. */
  incomplete?: boolean;
  /** Regions in which this dataset actually observed catalog resources or failed. */
  regions?: string[];
};

const ACCESS_DENIED_CODES = new Set([
  'AccessDenied',
  'AccessDeniedException',
  'AccessDeniedFault',
  'UnauthorizedException',
  'UnauthorizedOperation',
]);

const THROTTLED_CODES = new Set([
  'RequestLimitExceeded',
  'Throttling',
  'ThrottlingException',
  'TooManyRequestsException',
]);

const sortUnique = <T extends string>(values: T[]): T[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const classifyDiagnostic = (diagnostic: ScanDiagnostic): AwsCapabilityReason => {
  switch (diagnostic.code) {
    case 'CostOptimizationHubNotEnrolled':
    case 'OptInRequiredException':
      return 'not-enrolled';
    case 'RESOURCE_EXPLORER_AGGREGATOR_REQUIRED':
      return 'aggregator-required';
    case 'RESOURCE_EXPLORER_REGION_NOT_ENABLED':
    case 'RESOURCE_EXPLORER_NOT_ENABLED':
      return 'region-not-enabled';
    case 'RESOURCE_EXPLORER_DEFAULT_VIEW_REQUIRED':
      return 'default-view-required';
    case 'RESOURCE_EXPLORER_FILTERED_VIEW_UNSUPPORTED':
      return 'filtered-view';
    case 'RESOURCE_EXPLORER_TAGS_VIEW_REQUIRED':
      return 'tags-view-required';
    case 'CostOptimizationHubRecommendationIncomplete':
    case 'SavingsPlansCoverageIncomplete':
      return 'incomplete-evidence';
    case 'DataUnavailableException':
      return 'data-unavailable';
    default:
      break;
  }
  if (diagnostic.status === 'access_denied' || (diagnostic.code && ACCESS_DENIED_CODES.has(diagnostic.code))) {
    return 'access-denied';
  }
  if (diagnostic.status === 'throttled' || (diagnostic.code && THROTTLED_CODES.has(diagnostic.code))) {
    return 'throttled';
  }
  return diagnostic.status === 'error' ? 'service-error' : 'dataset-unavailable';
};

const projectObservation = (
  observation: AwsCapabilityDatasetObservation,
): { reasons: AwsCapabilityReason[]; status: AwsCapabilityStatus } => {
  if (observation.notAssessed) return { reasons: ['not-assessed'], status: 'unavailable' };
  const reasons = new Set(observation.diagnostics.map(classifyDiagnostic));
  if (observation.unavailable) {
    if (reasons.size === 0) reasons.add('dataset-unavailable');
    return {
      reasons: sortUnique([...reasons]),
      status: reasons.has('service-error') || reasons.has('throttled') ? 'error' : 'unavailable',
    };
  }
  const incompleteEvidence =
    observation.incomplete === true ||
    (observation.coverage?.unknown.length ?? 0) > 0 ||
    (observation.unavailableRegions?.length ?? 0) > 0;
  if (reasons.size > 0 || incompleteEvidence) {
    if (incompleteEvidence) reasons.add('incomplete-evidence');
    return { reasons: sortUnique([...reasons]), status: 'partial' };
  }
  return { reasons: [], status: 'available' };
};

const recommendationSourceCapabilities = new Map<string, AwsCapability>([
  ['ComputeOptimizer', 'compute-optimizer-enrollment'],
  ['CostExplorer', 'cost-explorer-access'],
]);

const collectRecommendationSourceOutcomes = (
  observations: AwsCapabilityDatasetObservation[],
  values: Partial<DiscoveryDatasetMap>,
): AwsCapabilityOutcome[] => {
  const groups = new Map<
    string,
    { capability: AwsCapability; accountId: string; region?: string; datasetKeys: Set<DiscoveryDatasetKey> }
  >();
  for (const observation of observations) {
    if (observation.unavailable) continue;
    if (getAwsDatasetCapability(observation.datasetKey) !== 'cost-optimization-hub-enrollment') continue;
    const rows: unknown = values[observation.datasetKey];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!isRecord(row)) continue;
      const capability =
        typeof row.recommendationSource === 'string'
          ? recommendationSourceCapabilities.get(row.recommendationSource)
          : undefined;
      const accountId = typeof row.accountId === 'string' && row.accountId.length > 0 ? row.accountId : undefined;
      if (!capability || !accountId) continue;
      const region = typeof row.region === 'string' ? row.region : undefined;
      const key = JSON.stringify([capability, accountId, region ?? null]);
      const group = groups.get(key) ?? {
        capability,
        accountId,
        ...(region ? { region } : {}),
        datasetKeys: new Set<DiscoveryDatasetKey>(),
      };
      group.datasetKeys.add(observation.datasetKey);
      groups.set(key, group);
    }
  }
  return [...groups.values()].map((group) => ({
    capability: group.capability,
    datasetKeys: sortUnique([...group.datasetKeys]),
    reasons: [],
    scope: {
      accountId: group.accountId,
      type: 'recommendation-source',
      ...(group.region ? { region: group.region } : {}),
    },
    status: 'available',
  }));
};

/**
 * Projects AWS capability readiness from finalized discovery dataset observations.
 *
 * This projection is read-only: it never calls AWS, never probes readiness, and
 * never mutates enrollment or setup state. Reasons come only from bounded
 * diagnostic codes and statuses — never from diagnostic message text. Successful
 * empty datasets are available evidence; a successful account-scoped tagging
 * query proves only that the queried aggregator view was accessible, not that
 * every enabled region is indexed. Observed Cost Optimization Hub recommendation
 * sources produce separate `recommendation-source` outcomes bounded to returned
 * records, so an empty Hub result cannot certify upstream Compute Optimizer
 * enrollment.
 *
 * @param observations - Finalized dataset loads, including unavailable ones.
 * @param regions - Selected regions or the all-region scan target used as fallback scope.
 * @param values - Normalized dataset records keyed by dataset for source projection.
 * @returns Deterministically ordered capability outcomes without duplicates.
 */
export const buildAwsCapabilityOutcomes = (
  observations: AwsCapabilityDatasetObservation[],
  regions: string[] | 'all',
  values: Partial<DiscoveryDatasetMap>,
): AwsCapabilityOutcome[] => {
  const byCapability = new Map<AwsCapability, AwsCapabilityDatasetObservation[]>();
  for (const observation of observations) {
    const capability = getAwsDatasetCapability(observation.datasetKey);
    if (!capability) continue;
    const group = byCapability.get(capability) ?? [];
    group.push(observation);
    byCapability.set(capability, group);
  }

  const outcomes: AwsCapabilityOutcome[] = [...byCapability.entries()].map(([capability, group]) => {
    const projected = group.map(projectObservation);
    const observedRegions = group.flatMap((observation) => observation.regions ?? []);
    const status: AwsCapabilityStatus = projected.every((entry) => entry.status === 'available')
      ? 'available'
      : projected.some((entry) => entry.status === 'available' || entry.status === 'partial')
        ? 'partial'
        : projected.some((entry) => entry.status === 'error')
          ? 'error'
          : 'unavailable';
    const regionalScope: AwsCapabilityOutcome['scope'] =
      observedRegions.length > 0
        ? { regions: sortUnique(observedRegions), type: 'regional' }
        : regions === 'all'
          ? { type: 'all-regions' }
          : { regions: sortUnique(regions), type: 'regional' };
    return {
      capability,
      datasetKeys: sortUnique(group.map((observation) => observation.datasetKey)),
      reasons: sortUnique(projected.flatMap((entry) => entry.reasons)),
      scope: capability === 'compute-optimizer-enrollment' ? regionalScope : { type: 'account' },
      status,
    };
  });

  return [...outcomes, ...collectRecommendationSourceOutcomes(observations, values)].sort(
    (left, right) =>
      left.capability.localeCompare(right.capability) ||
      JSON.stringify(left.scope).localeCompare(JSON.stringify(right.scope)),
  );
};
