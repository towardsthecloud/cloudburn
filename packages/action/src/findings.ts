import type { Finding, FindingMatch, ScanResult } from '@cloudburn/sdk';

/** A nested finding annotated with its parent rule-group metadata. */
export type FlattenedFinding = {
  ruleId: string;
  severity: Finding['severity'];
  message: Finding['message'];
  finding: FindingMatch;
};

/**
 * Flattens grouped scan results for renderers that operate on individual matches.
 *
 * @param result - The SDK scan result, grouped by provider and rule.
 * @returns One entry per finding match, carrying its rule id, severity, and message.
 */
export const flattenFindings = (result: ScanResult): FlattenedFinding[] =>
  result.providers.flatMap((providerGroup) =>
    providerGroup.rules.flatMap((ruleGroup) =>
      ruleGroup.findings.map((finding) => ({
        ruleId: ruleGroup.ruleId,
        severity: ruleGroup.severity,
        message: ruleGroup.message,
        finding,
      })),
    ),
  );
