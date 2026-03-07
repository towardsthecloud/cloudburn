import { fileURLToPath } from 'node:url';
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

  it('prints static findings as json and leaves a success exit code', async () => {
    const fixturePath = fileURLToPath(new URL('../../sdk/test/fixtures/terraform/scan-dir', import.meta.url));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const scanStatic = vi.spyOn(CloudBurnScanner.prototype, 'scanStatic').mockResolvedValue({
      source: 'iac',
      findings: [
        {
          id: 'CLDBRN-AWS-EBS-1:aws_ebs_volume.gp2_logs',
          ruleId: 'CLDBRN-AWS-EBS-1',
          message: 'EBS volume aws_ebs_volume.gp2_logs uses gp2; migrate to gp3.',
          resource: {
            provider: 'aws',
            accountId: '',
            region: '',
            service: 'ebs',
            resourceId: 'aws_ebs_volume.gp2_logs',
          },
          source: 'iac',
        },
      ],
    });

    await createProgram().parseAsync(['scan', fixturePath, '--format', 'json'], { from: 'user' });

    expect(scanStatic).toHaveBeenCalledWith(fixturePath);
    expect(stdout).toHaveBeenCalledWith(`{
  "findings": [
    {
      "id": "CLDBRN-AWS-EBS-1:aws_ebs_volume.gp2_logs",
      "ruleId": "CLDBRN-AWS-EBS-1",
      "message": "EBS volume aws_ebs_volume.gp2_logs uses gp2; migrate to gp3.",
      "resource": {
        "provider": "aws",
        "accountId": "",
        "region": "",
        "service": "ebs",
        "resourceId": "aws_ebs_volume.gp2_logs"
      },
      "source": "iac"
    }
  ]
}\n`);
    expect(process.exitCode).toBe(0);
  });
});
