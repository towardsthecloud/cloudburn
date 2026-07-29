import { describe, expect, it } from 'vitest';
import { EXIT_CODE_POLICY_VIOLATION } from '../src/exit-codes.js';
import { renderResponse } from '../src/formatters/output.js';
import { countScanResultFindings } from '../src/formatters/shared.js';

const findings = [
  {
    provider: 'aws' as const,
    rules: [
      {
        ruleId: 'CLDBRN-AWS-EC2-1',
        service: 'ec2',
        severity: 'medium' as const,
        source: 'iac' as const,
        message: 'EC2 instances should use preferred instance types.',
        findings: [
          {
            resourceId: 'i-placeholder',
            region: 'us-east-1',
          },
        ],
      },
    ],
  },
];

describe('commands and formatters', () => {
  it('formats findings as JSON', () => {
    const output = renderResponse({ kind: 'scan-result', result: { providers: findings } }, 'json');

    expect(output).toContain('CLDBRN-AWS-EC2-1');
  });

  it('keeps CI policy violation exit code stable', () => {
    expect(EXIT_CODE_POLICY_VIOLATION).toBe(1);
  });

  it('counts findings at or above an inclusive severity threshold', () => {
    const result = {
      providers: [
        {
          provider: 'aws' as const,
          rules: [
            ...findings[0].rules,
            { ...findings[0].rules[0], ruleId: 'HIGH', severity: 'high' as const },
            { ...findings[0].rules[0], ruleId: 'LOW', severity: 'low' as const },
          ],
        },
      ],
    };

    expect(countScanResultFindings(result, 'high')).toBe(1);
    expect(countScanResultFindings(result, 'medium')).toBe(2);
    expect(countScanResultFindings(result, 'low')).toBe(3);
    expect(countScanResultFindings(result)).toBe(3);
  });
});
