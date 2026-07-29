import { SEVERITIES } from '@cloudburn/rules';
import type { ScanPolicyResult, ScanResult, Severity } from './types.js';

/**
 * Evaluates active findings against an inclusive severity threshold.
 *
 * @param result - Grouped scan result to evaluate.
 * @param threshold - Lowest severity included, or omitted to include every finding.
 * @returns Observable policy threshold, qualifying count, and violation status.
 */
export const evaluateScanPolicy = (result: ScanResult, threshold?: Severity): ScanPolicyResult => {
  const maximumSeverityIndex = threshold === undefined ? SEVERITIES.length - 1 : SEVERITIES.indexOf(threshold);
  const qualifyingFindingCount = result.providers.reduce(
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

  return {
    qualifyingFindingCount,
    ...(threshold === undefined ? {} : { threshold }),
    violated: qualifyingFindingCount > 0,
  };
};
