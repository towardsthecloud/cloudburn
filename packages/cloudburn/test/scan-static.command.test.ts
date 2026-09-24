import { fileURLToPath } from 'node:url';
import { CloudBurnClient } from '@cloudburn/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from '../src/cli.js';

const staticScanResult = {
  providers: [
    {
      provider: 'aws' as const,
      rules: [
        {
          ruleId: 'CLDBRN-AWS-EBS-1',
          service: 'ebs',
          severity: 'medium' as const,
          source: 'iac' as const,
          message: 'EBS volumes should use current-generation storage.',
          findings: [
            {
              resourceId: 'aws_ebs_volume.gp2_logs',
              location: {
                path: 'main.tf',
                line: 4,
                column: 3,
              },
            },
          ],
        },
      ],
    },
  ],
};

describe('scan command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('accepts the global root format flag for static scans', async () => {
    const fixturePath = fileURLToPath(new URL('../../sdk/test/fixtures/terraform/scan-dir', import.meta.url));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const scanStatic = vi.spyOn(CloudBurnClient.prototype, 'scanStatic').mockResolvedValue(staticScanResult);

    await createProgram().parseAsync(['--format', 'json', 'scan', fixturePath], { from: 'user' });

    expect(scanStatic).toHaveBeenCalledWith(fixturePath);
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"ruleId": "CLDBRN-AWS-EBS-1"'));
    expect(process.exitCode).toBe(0);
  });

  it.each([
    {
      format: 'table',
      expectedOutput: `+----------+------------------+----------+--------+---------+-------------------------+---------+------+--------+----------------------------------------------------+
| Provider | RuleId           | Severity | Source | Service | ResourceId              | Path    | Line | Column | Message                                            |
+----------+------------------+----------+--------+---------+-------------------------+---------+------+--------+----------------------------------------------------+
| aws      | CLDBRN-AWS-EBS-1 | medium   | iac    | ebs     | aws_ebs_volume.gp2_logs | main.tf | 4    | 3      | EBS volumes should use current-generation storage. |
+----------+------------------+----------+--------+---------+-------------------------+---------+------+--------+----------------------------------------------------+
`,
    },
  ])('accepts $format output for static scans', async ({ format, expectedOutput }) => {
    const fixturePath = fileURLToPath(new URL('../../sdk/test/fixtures/terraform/scan-dir', import.meta.url));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const scanStatic = vi.spyOn(CloudBurnClient.prototype, 'scanStatic').mockResolvedValue(staticScanResult);

    await createProgram().parseAsync(['scan', fixturePath, '--format', format], { from: 'user' });

    expect(scanStatic).toHaveBeenCalledWith(fixturePath);
    expect(stdout).toHaveBeenCalledWith(expectedOutput);
    expect(process.exitCode).toBe(0);
  });

  it('prefers the command-local format option over the global root format', async () => {
    const fixturePath = fileURLToPath(new URL('../../sdk/test/fixtures/terraform/scan-dir', import.meta.url));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(CloudBurnClient.prototype, 'scanStatic').mockResolvedValue(staticScanResult);

    await createProgram().parseAsync(['--format', 'json', 'scan', fixturePath, '--format', 'table'], {
      from: 'user',
    });

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('| Provider |'));
    expect(process.exitCode).toBe(0);
  });

  it('fails only when static findings meet the --fail-on threshold', async () => {
    const fixturePath = fileURLToPath(new URL('../../sdk/test/fixtures/terraform/scan-dir', import.meta.url));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(CloudBurnClient.prototype, 'scanStatic').mockResolvedValue(staticScanResult);

    await createProgram().parseAsync(['scan', fixturePath, '--fail-on', 'high'], { from: 'user' });
    expect(process.exitCode).toBe(0);

    process.exitCode = undefined;
    await createProgram().parseAsync(['scan', fixturePath, '--fail-on', 'medium'], { from: 'user' });
    expect(process.exitCode).toBe(1);
  });

  it('does not fail CI gates when every static finding is suppressed', async () => {
    const fixturePath = fileURLToPath(new URL('../../sdk/test/fixtures/terraform/scan-dir', import.meta.url));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(CloudBurnClient.prototype, 'scanStatic').mockResolvedValue({
      providers: [],
      suppressed: [
        {
          finding: { resourceId: 'aws_ebs_volume.gp2_logs' },
          message: 'EBS volumes should use current-generation storage.',
          provider: 'aws',
          ruleId: 'CLDBRN-AWS-EBS-1',
          service: 'ebs',
          severity: 'medium',
          source: 'iac',
          suppression: {
            kind: 'all',
            location: { column: 1, line: 1, path: 'main.tf' },
          },
        },
      ],
    });

    await createProgram().parseAsync(['scan', fixturePath, '--exit-code', '--fail-on', 'low'], { from: 'user' });

    expect(process.exitCode).toBe(0);
  });

  it('passes comma-separated rule overrides and an explicit config path to the sdk', async () => {
    const fixturePath = fileURLToPath(new URL('../../sdk/test/fixtures/terraform/scan-dir', import.meta.url));
    const configPath = '/tmp/cloudburn-explicit.yml';

    vi.spyOn(CloudBurnClient.prototype, 'loadConfig').mockResolvedValue({
      discovery: {},
      iac: {},
    });
    const scanStatic = vi.spyOn(CloudBurnClient.prototype, 'scanStatic').mockResolvedValue(staticScanResult);

    await createProgram().parseAsync(
      [
        'scan',
        fixturePath,
        '--config',
        configPath,
        '--enabled-rules',
        'CLDBRN-AWS-EBS-1,CLDBRN-AWS-EC2-1',
        '--disabled-rules',
        'CLDBRN-AWS-S3-1',
      ],
      { from: 'user' },
    );

    expect(scanStatic).toHaveBeenCalledWith(
      fixturePath,
      {
        iac: {
          disabledRules: ['CLDBRN-AWS-S3-1'],
          enabledRules: ['CLDBRN-AWS-EBS-1', 'CLDBRN-AWS-EC2-1'],
        },
      },
      { configPath },
    );
    expect(process.exitCode).toBe(0);
  });

  it('passes comma-separated service overrides to the sdk', async () => {
    const fixturePath = fileURLToPath(new URL('../../sdk/test/fixtures/terraform/scan-dir', import.meta.url));

    vi.spyOn(CloudBurnClient.prototype, 'loadConfig').mockResolvedValue({
      discovery: {},
      iac: {},
    });
    const scanStatic = vi.spyOn(CloudBurnClient.prototype, 'scanStatic').mockResolvedValue(staticScanResult);

    await createProgram().parseAsync(['scan', fixturePath, '--service', 'ec2,s3'], { from: 'user' });

    expect(scanStatic).toHaveBeenCalledWith(fixturePath, {
      iac: {
        services: ['ec2', 's3'],
      },
    });
    expect(process.exitCode).toBe(0);
  });

  it('rejects sarif output before running a static scan', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const scanStatic = vi.spyOn(CloudBurnClient.prototype, 'scanStatic').mockResolvedValue(staticScanResult);
    const program = createProgram();
    const scanCommand = program.commands.find((command) => command.name() === 'scan');

    program.exitOverride();
    scanCommand?.exitOverride();

    await expect(program.parseAsync(['scan', '--format', 'sarif'], { from: 'user' })).rejects.toMatchObject({
      code: 'commander.invalidArgument',
      exitCode: 1,
      message: expect.stringContaining('sarif'),
    });
    expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('Allowed formats: json, table.');
    expect(scanStatic).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalled();
  });

  it('rejects invalid service filters before running a static scan', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const scanStatic = vi.spyOn(CloudBurnClient.prototype, 'scanStatic').mockResolvedValue(staticScanResult);
    const program = createProgram();
    const scanCommand = program.commands.find((command) => command.name() === 'scan');

    program.exitOverride();
    scanCommand?.exitOverride();

    await expect(program.parseAsync(['scan', '--service', 'invalid'], { from: 'user' })).rejects.toMatchObject({
      code: 'commander.invalidArgument',
      exitCode: 1,
      message: expect.stringContaining('Unknown service "invalid" for iac'),
    });
    expect(scanStatic).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalled();
  });
});
