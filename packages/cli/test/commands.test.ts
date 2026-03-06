import { describe, expect, it } from 'vitest';
import { EXIT_CODE_POLICY_VIOLATION } from '../src/exit-codes.js';
import { formatJson } from '../src/formatters/json.js';

const findings = [
  {
    id: 'CLDBRN-AWS-EC2-1:i-placeholder',
    ruleId: 'CLDBRN-AWS-EC2-1',
    message: 'Placeholder finding',
    resource: {
      provider: 'aws' as const,
      accountId: '',
      region: 'us-east-1',
      service: 'ec2',
      resourceId: 'i-placeholder',
    },
    source: 'iac' as const,
  },
];

describe('commands and formatters', () => {
  it('formats findings as JSON', () => {
    const output = formatJson(findings);

    expect(output).toContain('CLDBRN-AWS-EC2-1');
  });

  it('keeps CI policy violation exit code stable', () => {
    expect(EXIT_CODE_POLICY_VIOLATION).toBe(1);
  });
});
