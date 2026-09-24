import type { ScanResult } from '@cloudburn/sdk';
import { describe, expect, it } from 'vitest';
import { resolvePolicy } from '../src/policy.js';

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
  it('falls back to the configured policy when no inputs are set', () => {
    const result = resultWithFindings(['high']);
    result.policy = { qualifyingFindingCount: 1, threshold: 'medium', violated: true };
    expect(resolvePolicy(result, { exitCode: false }).violated).toBe(true);
    expect(resolvePolicy(resultWithFindings(['high']), { exitCode: false }).violated).toBe(false);
  });
});
