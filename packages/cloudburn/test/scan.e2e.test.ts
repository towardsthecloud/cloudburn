import { fileURLToPath } from 'node:url';
import { CloudBurnScanner } from '@cloudburn/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from '../src/cli.js';

const liveScanResult = {
  providers: [
    {
      provider: 'aws' as const,
      rules: [
        {
          ruleId: 'CLDBRN-AWS-EBS-1',
          service: 'ebs',
          source: 'discovery' as const,
          message: 'EBS volumes should use current-generation storage.',
          findings: [
            {
              resourceId: 'vol-123',
              region: 'us-east-1',
            },
          ],
        },
      ],
    },
  ],
};

const staticScanResult = {
  providers: [
    {
      provider: 'aws' as const,
      rules: [
        {
          ruleId: 'CLDBRN-AWS-EBS-1',
          service: 'ebs',
          source: 'iac' as const,
          message: 'EBS volumes should use current-generation storage.',
          findings: [
            {
              resourceId: 'aws_ebs_volume.gp2_logs',
              location: {
                path: 'main.tf',
                startLine: 4,
                startColumn: 3,
              },
            },
          ],
        },
      ],
    },
  ],
};

describe('scan command e2e', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('prints live findings as json and leaves a success exit code', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const scanLive = vi.spyOn(CloudBurnScanner.prototype, 'scanLive').mockResolvedValue(liveScanResult);

    await createProgram().parseAsync(['scan', '--live', '--format', 'json'], { from: 'user' });

    expect(scanLive).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenCalledWith(`{
  "providers": [
    {
      "provider": "aws",
      "rules": [
        {
          "ruleId": "CLDBRN-AWS-EBS-1",
          "service": "ebs",
          "source": "discovery",
          "message": "EBS volumes should use current-generation storage.",
          "findings": [
            {
              "resourceId": "vol-123",
              "region": "us-east-1"
            }
          ]
        }
      ]
    }
  ]
}\n`);
    expect(process.exitCode).toBe(0);
  });

  it('prints static findings as json and leaves a success exit code', async () => {
    const fixturePath = fileURLToPath(new URL('../../sdk/test/fixtures/terraform/scan-dir', import.meta.url));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const scanStatic = vi.spyOn(CloudBurnScanner.prototype, 'scanStatic').mockResolvedValue(staticScanResult);

    await createProgram().parseAsync(['scan', fixturePath, '--format', 'json'], { from: 'user' });

    expect(scanStatic).toHaveBeenCalledWith(fixturePath);
    expect(stdout).toHaveBeenCalledWith(`{
  "providers": [
    {
      "provider": "aws",
      "rules": [
        {
          "ruleId": "CLDBRN-AWS-EBS-1",
          "service": "ebs",
          "source": "iac",
          "message": "EBS volumes should use current-generation storage.",
          "findings": [
            {
              "resourceId": "aws_ebs_volume.gp2_logs",
              "location": {
                "path": "main.tf",
                "startLine": 4,
                "startColumn": 3
              }
            }
          ]
        }
      ]
    }
  ]
}\n`);
    expect(process.exitCode).toBe(0);
  });

  it('passes a cloudformation template path through to static autodetection', async () => {
    const fixturePath = fileURLToPath(
      new URL('../../sdk/test/fixtures/cloudformation/ebs-volume.yaml', import.meta.url),
    );
    const scanStatic = vi.spyOn(CloudBurnScanner.prototype, 'scanStatic').mockResolvedValue(staticScanResult);

    await createProgram().parseAsync(['scan', fixturePath, '--format', 'json'], { from: 'user' });

    expect(scanStatic).toHaveBeenCalledWith(fixturePath);
    expect(process.exitCode).toBe(0);
  });

  it('describes static autodetection in scan help output', () => {
    const program = createProgram();
    const scanCommand = program.commands.find((command) => command.name() === 'scan');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    scanCommand?.outputHelp();

    const help = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(help).toContain('Terraform file, CloudFormation template, or directory');
    expect(help).toContain('cloudburn scan ./main.tf');
    expect(help).toContain('cloudburn scan ./template.yaml');
    expect(help).toContain('cloudburn scan ./iac');
    expect(help).toContain('cloudburn scan --live');
    expect(help).not.toContain('--type');
  });

  it.each([
    {
      format: 'table',
      expectedOutput:
        'aws CLDBRN-AWS-EBS-1 iac ebs aws_ebs_volume.gp2_logs main.tf:4:3 EBS volumes should use current-generation storage.\n',
    },
    {
      format: 'sarif',
      expectedOutput: `{
  "version": "2.1.0",
  "runs": [
    {
      "tool": {
        "driver": {
          "name": "cloudburn"
        }
      },
      "results": [
        {
          "ruleId": "CLDBRN-AWS-EBS-1",
          "level": "warning",
          "message": {
            "text": "EBS volumes should use current-generation storage."
          },
          "locations": [
            {
              "physicalLocation": {
                "artifactLocation": {
                  "uri": "main.tf"
                },
                "region": {
                  "startLine": 4,
                  "startColumn": 3
                }
              }
            }
          ]
        }
      ]
    }
  ]
}\n`,
    },
  ])('accepts $format output for static scans', async ({ format, expectedOutput }) => {
    const fixturePath = fileURLToPath(new URL('../../sdk/test/fixtures/terraform/scan-dir', import.meta.url));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const scanStatic = vi.spyOn(CloudBurnScanner.prototype, 'scanStatic').mockResolvedValue(staticScanResult);

    await createProgram().parseAsync(['scan', fixturePath, '--format', format], { from: 'user' });

    expect(scanStatic).toHaveBeenCalledWith(fixturePath);
    expect(stdout).toHaveBeenCalledWith(expectedOutput);
    expect(process.exitCode).toBe(0);
  });

  it('rejects markdown output before running a scan', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const scanStatic = vi.spyOn(CloudBurnScanner.prototype, 'scanStatic').mockResolvedValue(staticScanResult);
    const program = createProgram();
    const scanCommand = program.commands.find((command) => command.name() === 'scan');

    program.exitOverride();
    scanCommand?.exitOverride();

    await expect(program.parseAsync(['scan', '--format', 'markdown'], { from: 'user' })).rejects.toMatchObject({
      code: 'commander.invalidArgument',
      exitCode: 1,
      message: expect.stringContaining('markdown'),
    });
    expect(scanStatic).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalled();
  });

  it('writes CREDENTIALS_ERROR json to stderr on AWS credential failures', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const err = new Error('Could not load credentials');
    err.name = 'CredentialsProviderError';
    vi.spyOn(CloudBurnScanner.prototype, 'scanLive').mockRejectedValue(err);

    await createProgram().parseAsync(['scan', '--live'], { from: 'user' });

    expect(process.exitCode).toBe(2);
    const output = (stderr.mock.calls[0]?.[0] as string) ?? '';
    const parsed = JSON.parse(output) as { error: { code: string } };
    expect(parsed.error.code).toBe('CREDENTIALS_ERROR');
  });

  it('writes PATH_NOT_FOUND json to stderr on ENOENT from scanStatic', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT', path: '/no/such/path' });
    vi.spyOn(CloudBurnScanner.prototype, 'scanStatic').mockRejectedValue(err);

    await createProgram().parseAsync(['scan', '/no/such/path'], { from: 'user' });

    expect(process.exitCode).toBe(2);
    const output = (stderr.mock.calls[0]?.[0] as string) ?? '';
    const parsed = JSON.parse(output) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('PATH_NOT_FOUND');
    expect(parsed.error.message).toContain('/no/such/path');
  });

  it('writes RUNTIME_ERROR json to stderr on unknown errors', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(CloudBurnScanner.prototype, 'scanLive').mockRejectedValue(new Error('Something unexpected'));

    await createProgram().parseAsync(['scan', '--live'], { from: 'user' });

    expect(process.exitCode).toBe(2);
    const output = (stderr.mock.calls[0]?.[0] as string) ?? '';
    const parsed = JSON.parse(output) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('RUNTIME_ERROR');
    expect(parsed.error.message).toBe('Something unexpected');
  });
});
