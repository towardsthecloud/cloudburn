import { describe, expect, it } from 'vitest';
import { evaluateScanPolicy, type ScanResult } from '../src/index.js';

const result: ScanResult = {
  providers: [
    {
      provider: 'aws',
      rules: [
        {
          findings: [{ resourceId: 'high' }],
          message: 'High finding',
          ruleId: 'HIGH',
          service: 'ec2',
          severity: 'high',
          source: 'iac',
        },
        {
          findings: [{ resourceId: 'medium-1' }, { resourceId: 'medium-2' }],
          message: 'Medium findings',
          ruleId: 'MEDIUM',
          service: 'ebs',
          severity: 'medium',
          source: 'iac',
        },
        {
          findings: [{ resourceId: 'low' }],
          message: 'Low finding',
          ruleId: 'LOW',
          service: 's3',
          severity: 'low',
          source: 'iac',
        },
      ],
    },
  ],
};

describe('scan policy', () => {
  it.each([
    { threshold: 'high' as const, qualifyingFindingCount: 1 },
    { threshold: 'medium' as const, qualifyingFindingCount: 3 },
    { threshold: 'low' as const, qualifyingFindingCount: 4 },
  ])('counts findings at or above $threshold severity', ({ threshold, qualifyingFindingCount }) => {
    expect(evaluateScanPolicy(result, threshold)).toEqual({
      qualifyingFindingCount,
      threshold,
      violated: true,
    });
  });

  it('treats an omitted threshold as an any-finding policy', () => {
    expect(evaluateScanPolicy(result)).toEqual({
      qualifyingFindingCount: 4,
      violated: true,
    });
  });
});
