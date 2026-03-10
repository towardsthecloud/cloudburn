import type { Finding, FindingMatch, Rule, ScanSource, SourceLocation } from './metadata.js';

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
 * Checks whether a value is a non-null record.
 *
 * @param value - Unknown value to narrow.
 * @returns Whether the value is a plain object-like record.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

type StaticFindingResource = {
  attributeLocations?: Record<string, SourceLocation>;
  location?: SourceLocation;
};

/**
 * Creates a static finding match and prefers attribute-level source locations
 * over the resource-level fallback.
 *
 * @param resource - IaC resource carrying location metadata.
 * @param resourceId - Stable resource identifier for the finding.
 * @param attributePaths - Attribute location keys to try in priority order.
 * @returns A normalized finding match for static scans.
 */
export const createStaticFindingMatch = (
  resource: StaticFindingResource,
  resourceId: string,
  attributePaths: string[],
): FindingMatch =>
  createFindingMatch(
    resourceId,
    undefined,
    undefined,
    attributePaths
      .map((attributePath) => resource.attributeLocations?.[attributePath])
      .find((location): location is SourceLocation => Boolean(location)) ?? resource.location,
  );

/**
 * Creates a lean grouped finding for a rule when nested matches exist.
 * @param rule Rule metadata that owns the stable grouped fields.
 * @param source Scan mode that produced the matches.
 * @param findings Nested resource-level matches for the rule.
 * @returns A grouped finding or `null` when there are no nested matches.
 */
export const createFinding = (
  rule: Pick<Rule, 'id' | 'service' | 'message'>,
  source: ScanSource,
  findings: FindingMatch[],
): Finding | null =>
  findings.length > 0
    ? {
        ruleId: rule.id,
        service: rule.service,
        source,
        message: rule.message,
        findings,
      }
    : null;

/** Returns the stable rule identifiers from a rule collection. */
export const toRuleIds = (rules: Rule[]): string[] => rules.map((rule) => rule.id);
