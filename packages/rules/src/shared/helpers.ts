import type { Finding, FindingMatch, Rule, ScanSource } from './metadata.js';

// Intent: provide lightweight helper utilities for authoring consistent rules.
// TODO(cloudburn): add rule ID validation and metadata lint helpers.
/** Creates a built-in or custom rule definition with the shared contract intact. */
export const createRule = (rule: Rule): Rule => rule;

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
