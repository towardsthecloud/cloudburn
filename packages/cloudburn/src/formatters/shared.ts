import type { Finding, FindingMatch, ProviderFindingGroup, ScanDiagnostic, ScanResult, Severity } from '@cloudburn/sdk';

/** A nested finding annotated with its parent provider and rule-group metadata. */
export type FlattenedFinding = {
  provider: ProviderFindingGroup['provider'];
  ruleId: string;
  service: Finding['service'];
  severity: Finding['severity'];
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
        severity: ruleGroup.severity,
        source: ruleGroup.source,
        message: ruleGroup.message,
        finding,
      })),
    ),
  );

const SEVERITY_RANK: Record<Severity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/** Counts nested resource-level findings across the full scan result at or above an optional severity threshold. */
export const countScanResultFindings = (result: ScanResult, threshold?: Severity): number =>
  flattenScanResult(result).filter(
    ({ severity }) => threshold === undefined || SEVERITY_RANK[severity] >= SEVERITY_RANK[threshold],
  ).length;

/** Resolves CLI/config gating precedence and reports whether active findings violate the policy. */
export const hasPolicyViolation = (
  result: ScanResult,
  options: { configFailOn?: Severity; exitCode?: boolean; failOn?: Severity },
): boolean => {
  const enabled = options.failOn !== undefined || options.exitCode === true || options.configFailOn !== undefined;
  const threshold = options.failOn ?? (options.exitCode === true ? undefined : options.configFailOn);

  return enabled && countScanResultFindings(result, threshold) > 0;
};

/** Returns the non-fatal scan diagnostics attached to a result. */
export const getScanDiagnostics = (result: ScanResult): ScanDiagnostic[] => result.diagnostics ?? [];
