import { SEVERITIES } from '@cloudburn/rules';
import { flattenFindings } from './findings.js';
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
  const qualifyingFindingCount = flattenFindings(result).filter(({ severity }) => {
    const severityIndex = SEVERITIES.indexOf(severity);
    return severityIndex !== -1 && severityIndex <= maximumSeverityIndex;
  }).length;

  return {
    qualifyingFindingCount,
    ...(threshold === undefined ? {} : { threshold }),
    violated: qualifyingFindingCount > 0,
  };
};

/**
 * Resolves the policy outcome for explicit caller controls. An explicit `failOn` threshold wins, then `exitCode`
 * fails on any active finding, then the policy the scan evaluated from config applies.
 *
 * @param result - Grouped scan result to evaluate.
 * @param controls - Caller policy controls, such as CLI flags or action inputs.
 * @returns The active policy outcome; no violation when nothing is configured.
 */
export const resolveScanPolicy = (
  result: ScanResult,
  controls: { exitCode?: boolean; failOn?: Severity },
): ScanPolicyResult => {
  if (controls.failOn !== undefined) {
    return evaluateScanPolicy(result, controls.failOn);
  }

  return controls.exitCode === true
    ? evaluateScanPolicy(result)
    : (result.policy ?? { qualifyingFindingCount: 0, violated: false });
};
