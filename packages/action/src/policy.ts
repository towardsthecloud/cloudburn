import { evaluateScanPolicy, type ScanPolicyResult, type ScanResult, type Severity } from '@cloudburn/sdk';

/**
 * Applies the CLI's flag precedence on top of the policy already evaluated by
 * the SDK: explicit `fail-on`, then `exit-code`, then the configured policy.
 *
 * @param result - Grouped scan result to evaluate.
 * @param inputs - Action policy inputs.
 * @returns The active policy outcome.
 */
export const resolvePolicy = (
  result: ScanResult,
  inputs: { exitCode: boolean; failOn?: Severity },
): ScanPolicyResult => {
  if (inputs.failOn !== undefined) {
    return evaluateScanPolicy(result, inputs.failOn);
  }

  return inputs.exitCode
    ? evaluateScanPolicy(result)
    : (result.policy ?? { qualifyingFindingCount: 0, violated: false });
};

/** Human-readable job failure line describing the tripped policy. */
export const failureSummary = (policy: ScanPolicyResult): string =>
  policy.threshold === undefined
    ? `CloudBurn scan failed: ${policy.qualifyingFindingCount} finding(s) detected.`
    : `CloudBurn scan failed: ${policy.qualifyingFindingCount} finding(s) at or above ${policy.threshold} severity.`;
