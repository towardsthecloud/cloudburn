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
      source: 'discovery',
      findings: [
        {
          id: 'CLDBRN-AWS-EBS-1:vol-123',
          ruleId: 'CLDBRN-AWS-EBS-1',
          message: 'EBS volume vol-123 uses gp2; migrate to gp3.',
          resource: {
            provider: 'aws',
            accountId: '',
            region: 'us-east-1',
            service: 'ebs',
            resourceId: 'vol-123',
          },
          source: 'discovery',
        },
      ],
    });

    await createProgram().parseAsync(['scan', '--live', '--format', 'json'], { from: 'user' });

    expect(scanLive).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenCalledWith(`{
  "findings": [
    {
      "id": "CLDBRN-AWS-EBS-1:vol-123",
      "ruleId": "CLDBRN-AWS-EBS-1",
      "message": "EBS volume vol-123 uses gp2; migrate to gp3.",
      "resource": {
        "provider": "aws",
        "accountId": "",
        "region": "us-east-1",
        "service": "ebs",
        "resourceId": "vol-123"
      },
      "source": "discovery"
    }
  ]
}\n`);
    expect(process.exitCode).toBe(0);
  });
});
