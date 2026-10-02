import { describe, expect, it } from 'vitest';
import { evaluateScanPolicy, flattenFindings, resolveScanPolicy, type ScanResult } from '../src/index.js';

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

describe('resolveScanPolicy', () => {
  const configured = { ...result, policy: { qualifyingFindingCount: 0, threshold: 'high' as const, violated: false } };

  it('applies an explicit fail-on threshold before exit-code and the configured policy', () => {
    expect(resolveScanPolicy(configured, { exitCode: true, failOn: 'medium' })).toEqual({
      qualifyingFindingCount: 3,
      threshold: 'medium',
      violated: true,
    });
  });

  it('applies exit-code as an any-finding policy before the configured policy', () => {
    expect(resolveScanPolicy(configured, { exitCode: true }).violated).toBe(true);
  });

  it('falls back to the configured policy, or no violation when none is configured', () => {
    expect(resolveScanPolicy(configured, {})).toBe(configured.policy);
    expect(resolveScanPolicy(result, { exitCode: false })).toEqual({ qualifyingFindingCount: 0, violated: false });
  });
});

describe('flattenFindings', () => {
  it('returns one entry per finding with its provider and rule metadata', () => {
    expect(
      flattenFindings(result).map(({ finding, provider, ruleId, service, severity, source }) => ({
        provider,
        resourceId: finding.resourceId,
        ruleId,
        service,
        severity,
        source,
      })),
    ).toEqual([
      { provider: 'aws', resourceId: 'high', ruleId: 'HIGH', service: 'ec2', severity: 'high', source: 'iac' },
      { provider: 'aws', resourceId: 'medium-1', ruleId: 'MEDIUM', service: 'ebs', severity: 'medium', source: 'iac' },
      { provider: 'aws', resourceId: 'medium-2', ruleId: 'MEDIUM', service: 'ebs', severity: 'medium', source: 'iac' },
      { provider: 'aws', resourceId: 'low', ruleId: 'LOW', service: 's3', severity: 'low', source: 'iac' },
    ]);
    expect(flattenFindings(result)[0]?.message).toBe('High finding');
  });
});
