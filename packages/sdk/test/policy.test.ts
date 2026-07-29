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
  it('reports the inclusive threshold, qualifying finding count, and violation status', () => {
    expect(evaluateScanPolicy(result, 'medium')).toEqual({
      qualifyingFindingCount: 3,
      threshold: 'medium',
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
