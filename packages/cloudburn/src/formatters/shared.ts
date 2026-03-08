import type { Finding, FindingMatch, ProviderFindingGroup, ScanResult } from '@cloudburn/sdk';

/** A nested finding annotated with its parent provider and rule-group metadata. */
export type FlattenedFinding = {
  provider: ProviderFindingGroup['provider'];
  ruleId: string;
  service: Finding['service'];
  source: Finding['source'];
  message: Finding['message'];
  finding: FindingMatch;
};

/** Flattens grouped scan results for formatters that operate on individual matches. */
export const flattenScanResult = (result: ScanResult): FlattenedFinding[] =>
  result.providers.flatMap((providerGroup) =>
    providerGroup.rules.flatMap((ruleGroup) =>
      ruleGroup.findings.map((finding) => ({
        provider: providerGroup.provider,
        ruleId: ruleGroup.ruleId,
        service: ruleGroup.service,
        source: ruleGroup.source,
        message: ruleGroup.message,
        finding,
      })),
    ),
  );

/** Counts nested resource-level findings across the full scan result. */
export const countScanResultFindings = (result: ScanResult): number => flattenScanResult(result).length;
