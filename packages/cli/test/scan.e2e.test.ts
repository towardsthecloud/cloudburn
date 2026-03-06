import { CloudBurnScanner } from '@cloudburn/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from '../src/cli.js';

describe('scan command e2e', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('prints live findings as json and leaves a success exit code', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const scanLive = vi.spyOn(CloudBurnScanner.prototype, 'scanLive').mockResolvedValue({
      mode: 'live',
      findings: [
        {
          id: 'ebs-gp2-to-gp3:vol-123',
          ruleId: 'ebs-gp2-to-gp3',
          severity: 'warning',
          message: 'EBS volume vol-123 uses gp2; migrate to gp3.',
          location: 'aws://ebs/us-east-1/vol-123',
          mode: 'live',
        },
      ],
    });

    await createProgram().parseAsync(['scan', '--live', '--format', 'json'], { from: 'user' });

    expect(scanLive).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenCalledWith(`{
  "findings": [
    {
      "id": "ebs-gp2-to-gp3:vol-123",
      "ruleId": "ebs-gp2-to-gp3",
      "severity": "warning",
      "message": "EBS volume vol-123 uses gp2; migrate to gp3.",
      "location": "aws://ebs/us-east-1/vol-123",
      "mode": "live"
    }
  ]
}\n`);
    expect(process.exitCode).toBe(0);
  });
});
