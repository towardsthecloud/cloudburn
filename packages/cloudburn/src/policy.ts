import { evaluateScanPolicy, type ScanResult, type Severity } from '@cloudburn/sdk';

/**
 * Applies CLI flag precedence on top of the policy already evaluated by the SDK.
 *
 * @param result - Grouped scan result to evaluate.
 * @param options - Explicit CLI policy controls.
 * @returns Whether the active findings should produce a policy failure.
 */
export const hasPolicyViolation = (result: ScanResult, options: { exitCode?: boolean; failOn?: Severity }): boolean => {
  if (options.failOn !== undefined) {
    return evaluateScanPolicy(result, options.failOn).violated;
  }

  return options.exitCode === true ? evaluateScanPolicy(result).violated : (result.policy?.violated ?? false);
};
