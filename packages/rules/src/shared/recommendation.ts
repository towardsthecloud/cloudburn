import { canonicalizeAwsResourceId, getAwsArnScope } from '../aws/resource-identity.js';
import type { CloudProvider, EvidenceProvenance, FindingMatch, RecommendationIdentity } from './metadata.js';

/**
 * Computes the canonical resource and opportunity identity for a finding match.
 *
 * The identity requires a complete scope: resource ID, resource namespace, account,
 * Region, and action. When the AWS resource ID is an ARN whose embedded account or
 * Region conflicts with the supplied scope, no identity is produced so unrelated
 * resources can never be deduplicated together.
 *
 * @param provider - Cloud provider that owns the resource.
 * @param match - Finding match scope fields to identify.
 * @returns Opaque versioned keys, or `undefined` when the scope is incomplete or conflicts.
 */
export const getRecommendationIdentity = (
  provider: CloudProvider,
  match: Pick<FindingMatch, 'resourceId' | 'resourceType' | 'accountId' | 'region' | 'actionType'>,
): RecommendationIdentity | undefined => {
  const { resourceId, resourceType, accountId, region, actionType } = match;
  if (!resourceId || !resourceType || !accountId || !region || !actionType) return undefined;
  if (provider === 'aws' && resourceId.startsWith('arn:')) {
    const arnScope = getAwsArnScope(resourceId);
    if (
      !arnScope ||
      (arnScope.region !== '' && arnScope.region !== region) ||
      (arnScope.accountId !== '' && arnScope.accountId !== accountId)
    ) {
      return undefined;
    }
  }
  const canonicalResourceId = provider === 'aws' ? canonicalizeAwsResourceId(resourceType, resourceId) : resourceId;
  if (provider === 'aws' && resourceType === 'ecs:service' && !/^[^/:]+\/[^/]+$/.test(canonicalResourceId)) {
    return undefined;
  }
  const scope = [provider, accountId, region, resourceType, canonicalResourceId];
  return {
    resourceKey: JSON.stringify(['resource', 1, ...scope]),
    opportunityId: JSON.stringify(['opportunity', 1, ...scope, actionType]),
  };
};

/**
 * Attaches evidence provenance and the computed identity to a finding match.
 *
 * When the match scope is incomplete the returned match carries provenance only; a
 * missing identity is never fabricated from the source recommendation ID.
 *
 * @param provider - Cloud provider that owns the resource.
 * @param match - Finding match describing the recommended resource and action.
 * @param provenance - Evidence source, optional source detail and ID, and source timestamps.
 * @returns A finding match carrying normalized recommendation evidence.
 */
export const createRecommendationMatch = (
  provider: CloudProvider,
  match: FindingMatch,
  provenance: EvidenceProvenance,
): FindingMatch => ({ ...match, recommendation: { ...provenance, ...getRecommendationIdentity(provider, match) } });

const compareStrings = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      return JSON.stringify(value) ?? 'null';
    }
    return `{${Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

const recommendationTimestampMs = (value: string | undefined): number => {
  const parsed = value === undefined ? Number.NaN : Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
};

const deduplicationKey = (match: FindingMatch): string => {
  const recommendation = match.recommendation;
  if (recommendation?.opportunityId) {
    return `opportunity:${recommendation.opportunityId}`;
  }
  if (recommendation?.sourceId !== undefined) {
    return `source:${canonicalJson([
      recommendation.source ?? null,
      recommendation.sourceDetail ?? null,
      match.accountId ?? null,
      match.region ?? null,
      match.resourceType ?? null,
      match.resourceId,
      match.actionType ?? null,
      recommendation.sourceId,
    ])}`;
  }
  return `content:${canonicalJson(match)}`;
};

/**
 * Orders finding matches by recommendation freshness with deterministic tie-breaks.
 *
 * Newer `refreshedAt` sorts first, then `observedAt`, then source ID, source
 * detail, and finally canonical content. Missing or unparseable source
 * timestamps sort last rather than counting as fresh.
 *
 * @param left - First finding match.
 * @param right - Second finding match.
 * @returns Negative when `left` sorts before `right`, positive for the reverse.
 */
export const compareRecommendationMatches = (left: FindingMatch, right: FindingMatch): number =>
  recommendationTimestampMs(right.recommendation?.refreshedAt) -
    recommendationTimestampMs(left.recommendation?.refreshedAt) ||
  recommendationTimestampMs(right.recommendation?.observedAt) -
    recommendationTimestampMs(left.recommendation?.observedAt) ||
  compareStrings(left.recommendation?.sourceId ?? '', right.recommendation?.sourceId ?? '') ||
  compareStrings(left.recommendation?.sourceDetail ?? '', right.recommendation?.sourceDetail ?? '') ||
  compareStrings(canonicalJson(left), canonicalJson(right));

/**
 * Deduplicates matches emitted by one evaluator for the same recommendation opportunity.
 *
 * Matches group by computed opportunity identity, then by scoped source ID so reused
 * source IDs in another account, Region, namespace, resource, or action never collapse,
 * and finally by exact canonical content. The freshest `refreshedAt` wins each group,
 * then `observedAt`, source IDs, and deterministic content order. Output is sorted so
 * input order never changes the result.
 *
 * @param matches - Finding matches emitted by a single rule evaluation.
 * @returns Deduplicated matches in deterministic order.
 */
export const deduplicateRecommendationMatches = (matches: FindingMatch[]): FindingMatch[] => {
  const matchesByKey = new Map<string, FindingMatch>();
  for (const match of matches) {
    const key = deduplicationKey(match);
    const existing = matchesByKey.get(key);
    if (!existing || compareRecommendationMatches(match, existing) < 0) {
      matchesByKey.set(key, match);
    }
  }
  return [...matchesByKey.values()].sort(compareRecommendationMatches);
};
