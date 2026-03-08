import { describe, expect, it } from 'vitest';
import { EXIT_CODE_POLICY_VIOLATION } from '../src/exit-codes.js';
import { formatJson } from '../src/formatters/json.js';

const findings = [
  {
    provider: 'aws' as const,
    rules: [
      {
        ruleId: 'CLDBRN-AWS-EC2-1',
        service: 'ec2',
        source: 'iac' as const,
        message: 'EC2 instances should use approved instance-type profiles.',
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
    const output = formatJson({ providers: findings });

    expect(output).toContain('CLDBRN-AWS-EC2-1');
  });

  it('keeps CI policy violation exit code stable', () => {
    expect(EXIT_CODE_POLICY_VIOLATION).toBe(1);
  });
});
