import type { ScanResult } from '@cloudburn/sdk';
import { describe, expect, it } from 'vitest';
import { failureSummary, resolvePolicy } from '../src/policy.js';

const resultWithFindings = (severities: Array<'high' | 'medium' | 'low'>): ScanResult => ({
  providers: [
    {
      provider: 'aws',
      rules: severities.map((severity, index) => ({
        ruleId: `CLDBRN-AWS-TEST-${index}`,
        service: 'test',
        source: 'iac' as const,
        severity,
        message: 'test message',
        findings: [{ resourceId: `resource-${index}` }],
      })),
    },
  ],
});

describe('resolvePolicy', () => {
  it('fails for findings at or above the fail-on threshold', () => {
    const result = resultWithFindings(['medium', 'low']);
    expect(resolvePolicy(result, { exitCode: false, failOn: 'medium' }).violated).toBe(true);
    expect(resolvePolicy(result, { exitCode: false, failOn: 'high' }).violated).toBe(false);
  });

  it('fails on any finding when exit-code is set', () => {
    const result = resultWithFindings(['low']);
    expect(resolvePolicy(result, { exitCode: true }).violated).toBe(true);
    expect(resolvePolicy(resultWithFindings([]), { exitCode: true }).violated).toBe(false);
  });

  it('falls back to the configured policy when no inputs are set', () => {
    const result = resultWithFindings(['high']);
    result.policy = { qualifyingFindingCount: 1, threshold: 'medium', violated: true };
    expect(resolvePolicy(result, { exitCode: false }).violated).toBe(true);
    expect(resolvePolicy(resultWithFindings(['high']), { exitCode: false }).violated).toBe(false);
  });
});

describe('failureSummary', () => {
  it('names the threshold when one is active', () => {
    expect(failureSummary({ qualifyingFindingCount: 2, threshold: 'high', violated: true })).toBe(
      'CloudBurn scan failed: 2 finding(s) at or above high severity.',
    );
  });

  it('omits the threshold for the any-finding policy', () => {
    expect(failureSummary({ qualifyingFindingCount: 3, violated: true })).toBe(
      'CloudBurn scan failed: 3 finding(s) detected.',
    );
  });
});
