import { type ScanResult, SEVERITIES, type Severity } from '@cloudburn/sdk';

/**
 * Counts resource-level findings at or above an optional severity threshold.
 *
 * @param result - Grouped scan result to count.
 * @param threshold - Lowest severity included in the count.
 * @returns Number of matching resource-level findings.
 */
export const countScanResultFindings = (result: ScanResult, threshold?: Severity): number => {
  const maximumSeverityIndex = threshold === undefined ? SEVERITIES.length - 1 : SEVERITIES.indexOf(threshold);

  return result.providers.reduce(
    (total, providerGroup) =>
      total +
      providerGroup.rules.reduce((providerTotal, ruleGroup) => {
        const severityIndex = SEVERITIES.indexOf(ruleGroup.severity);
        return (
          providerTotal +
          (severityIndex !== -1 && severityIndex <= maximumSeverityIndex ? ruleGroup.findings.length : 0)
        );
      }, 0),
    0,
  );
};

/**
 * Resolves CLI/config gating precedence and reports whether active findings violate the policy.
 *
 * @param result - Grouped scan result to evaluate.
 * @param options - CLI and config policy controls in precedence order.
 * @returns Whether the active findings should produce a policy failure.
 */
export const hasPolicyViolation = (
  result: ScanResult,
  options: { configFailOn?: Severity; exitCode?: boolean; failOn?: Severity },
): boolean => {
  const enabled = options.failOn !== undefined || options.exitCode === true || options.configFailOn !== undefined;
  const threshold = options.failOn ?? (options.exitCode === true ? undefined : options.configFailOn);

  return enabled && countScanResultFindings(result, threshold) > 0;
};
