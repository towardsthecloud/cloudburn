import { describe, expect, it } from 'vitest';
import { EXIT_CODE_POLICY_VIOLATION } from '../src/exit-codes.js';
import { formatJson } from '../src/formatters/json.js';

const findings = [
  {
    id: 'finding-1',
    ruleId: 'aws-ec2-placeholder',
    severity: 'warning' as const,
    message: 'Placeholder finding',
    location: 'resource://placeholder',
    mode: 'static' as const,
  },
];

describe('commands and formatters', () => {
  it('formats findings as JSON', () => {
    const output = formatJson(findings);

    expect(output).toContain('aws-ec2-placeholder');
  });

  it('keeps CI policy violation exit code stable', () => {
    expect(EXIT_CODE_POLICY_VIOLATION).toBe(1);
  });
});
