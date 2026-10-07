import type {
  Finding,
  FindingMatch,
  LiveEvaluationContext,
  LiveEvaluationCoverage,
  LiveResourceBag,
  Rule,
  Source,
  SourceLocation,
} from './metadata.js';

// Intent: provide lightweight helper utilities for authoring consistent rules.
// TODO(cloudburn): add rule ID validation and metadata lint helpers.
/** Creates a built-in or custom rule definition with the shared contract intact. */
export const createRule = (rule: Rule): Rule => rule;

/**
 * Creates a normalized resource-level finding match.
 *
 * @param resourceId - Stable resource identifier for the finding.
 * @param region - Optional cloud region where the resource was found.
 * @param accountId - Optional cloud account identifier that owns the resource.
 * @param location - Optional source location for static findings.
 * @returns A lean finding match object without empty fields.
 */
export const createFindingMatch = (
  resourceId: string,
  region?: string,
  accountId?: string,
  location?: SourceLocation,
): FindingMatch => ({
  resourceId,
  ...(region ? { region } : {}),
  ...(accountId ? { accountId } : {}),
  ...(location ? { location } : {}),
});

/**
 * Partitions resource identities by whether a live policy can establish its result.
 *
 * @param resources - Inventory entries considered by the rule, including entries with missing metrics.
 * @param isAssessed - Whether the rule has sufficient evidence to establish a finding or a non-finding.
 * @param toMatch - Maps each resource to the same identity used by its findings.
 * @returns Assessed and unknown resource identities in inventory order.
 */
export const createLiveEvaluationCoverage = <Resource>(
  resources: readonly Resource[],
  isAssessed: (resource: Resource) => boolean,
  toMatch: (resource: Resource) => FindingMatch,
): LiveEvaluationCoverage => {
  const coverage: LiveEvaluationCoverage = { assessed: [], unknown: [] };

  for (const resource of resources) {
    coverage[isAssessed(resource) ? 'assessed' : 'unknown'].push(toMatch(resource));
  }

  return coverage;
};

/**
 * Returns a derived index shared by a rule's live callbacks, building it once per evaluation.
 *
 * @param context - Live evaluation context that may carry the per-rule scratch memo.
 * @param build - Module-level builder keyed in the scratch memo and invoked with the bag of resources.
 * @returns The memoized index, or a freshly built index when the context carries no scratch.
 */
export const getLiveEvaluationIndex = <T>(
  context: LiveEvaluationContext,
  build: (resources: LiveResourceBag) => T,
): T => {
  const { scratch } = context;
  if (!scratch) return build(context.resources);
  if (scratch.has(build)) return scratch.get(build) as T;
  const index = build(context.resources);
  scratch.set(build, index);
  return index;
};

/**
 * Checks whether a value is a non-null record.
 *
 * @param value - Unknown value to narrow.
 * @returns Whether the value is a plain object-like record.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Creates a lean grouped finding for a rule when nested matches exist.
 * @param rule Rule metadata that owns the stable grouped fields.
 * @param source Scan mode that produced the matches.
 * @param findings Nested resource-level matches for the rule.
 * @returns A grouped finding or `null` when there are no nested matches.
 */
export const createFinding = (
  rule: Pick<Rule, 'id' | 'service' | 'severity' | 'message'>,
  source: Source,
  findings: FindingMatch[],
): Finding | null =>
  findings.length > 0
    ? {
        ruleId: rule.id,
        service: rule.service,
        source,
        severity: rule.severity,
        message: rule.message,
        findings,
      }
    : null;

/**
 * Keys AWS evidence by account, region, and the service's resource identifier.
 *
 * @param accountId - AWS account owning the resource.
 * @param region - AWS region containing the resource.
 * @param resourceId - Service-local resource identifier.
 * @returns A collision-free key for joining normalized AWS evidence.
 */
export const getAwsResourceScopeKey = (accountId: string, region: string, resourceId: string): string =>
  JSON.stringify([accountId, region, resourceId]);
