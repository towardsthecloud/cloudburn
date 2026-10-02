import type { FlattenedFinding, ScanResult } from './types.js';

/**
 * Flattens a grouped scan result into one entry per finding match.
 *
 * @param result - Scan result grouped by provider and rule.
 * @returns Finding matches in result order, each with its provider and rule metadata.
 */
export const flattenFindings = (result: ScanResult): FlattenedFinding[] =>
  result.providers.flatMap((providerGroup) =>
    providerGroup.rules.flatMap((ruleGroup) =>
      ruleGroup.findings.map((finding) => ({
        provider: providerGroup.provider,
        ruleId: ruleGroup.ruleId,
        service: ruleGroup.service,
        severity: ruleGroup.severity,
        source: ruleGroup.source,
        message: ruleGroup.message,
        finding,
      })),
    ),
  );
