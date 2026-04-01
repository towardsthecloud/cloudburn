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

const setStderrIsTTY = (value: boolean): (() => void) => {
  const descriptor = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');

  Object.defineProperty(process.stderr, 'isTTY', {
    configurable: true,
    value,
  });

  return () => {
    if (descriptor) {
      Object.defineProperty(process.stderr, 'isTTY', descriptor);
      return;
    }

    delete (process.stderr as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
  };
};

describe('scan command e2e', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('prints static findings as json and leaves a success exit code', async () => {
    const fixturePath = fileURLToPath(new URL('../../sdk/test/fixtures/terraform/scan-dir', import.meta.url));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const scanStatic = vi.spyOn(CloudBurnClient.prototype, 'scanStatic').mockResolvedValue(staticScanResult);

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
                "line": 4,
                "column": 3
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

  it('writes scan progress to stderr during interactive runs without changing stdout output', async () => {
    const restoreTTY = setStderrIsTTY(true);
    const fixturePath = fileURLToPath(new URL('../../sdk/test/fixtures/terraform/scan-dir', import.meta.url));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const scanStatic = vi.spyOn(CloudBurnClient.prototype, 'scanStatic').mockResolvedValue(staticScanResult);

    try {
      await createProgram().parseAsync(['scan', fixturePath, '--format', 'json'], { from: 'user' });
    } finally {
      restoreTTY();
    }

    const progressOutput = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(scanStatic).toHaveBeenCalledWith(fixturePath);
    expect(progressOutput).toContain('Load config');
    expect(progressOutput).toContain('Scan IaC');
    expect(progressOutput).toContain('Evaluate rules');
    expect(progressOutput).toContain('Render output');
    expect(progressOutput).toContain('\r');
    expect(progressOutput.endsWith('\n')).toBe(true);
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
                "line": 4,
                "column": 3
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

  it('does not write scan progress when stderr is not a tty', async () => {
    const restoreTTY = setStderrIsTTY(false);
    const fixturePath = fileURLToPath(new URL('../../sdk/test/fixtures/terraform/scan-dir', import.meta.url));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const scanStatic = vi.spyOn(CloudBurnClient.prototype, 'scanStatic').mockResolvedValue(staticScanResult);

    try {
      await createProgram().parseAsync(['scan', fixturePath, '--format', 'json'], { from: 'user' });
    } finally {
      restoreTTY();
    }

    expect(scanStatic).toHaveBeenCalledWith(fixturePath);
    expect(stderr).not.toHaveBeenCalled();
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
                "line": 4,
                "column": 3
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

  it('accepts the global root format flag for static scans', async () => {
    const fixturePath = fileURLToPath(new URL('../../sdk/test/fixtures/terraform/scan-dir', import.meta.url));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const scanStatic = vi.spyOn(CloudBurnClient.prototype, 'scanStatic').mockResolvedValue(staticScanResult);

    await createProgram().parseAsync(['--format', 'json', 'scan', fixturePath], { from: 'user' });

    expect(scanStatic).toHaveBeenCalledWith(fixturePath);
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"ruleId": "CLDBRN-AWS-EBS-1"'));
    expect(process.exitCode).toBe(0);
  });

  it('passes a cloudformation template path through to static autodetection', async () => {
    const fixturePath = fileURLToPath(
      new URL('../../sdk/test/fixtures/cloudformation/ebs-volume.yaml', import.meta.url),
    );
    const scanStatic = vi.spyOn(CloudBurnClient.prototype, 'scanStatic').mockResolvedValue(staticScanResult);

    await createProgram().parseAsync(['scan', fixturePath, '--format', 'json'], { from: 'user' });

    expect(scanStatic).toHaveBeenCalledWith(fixturePath);
    expect(process.exitCode).toBe(0);
  });

  it.each([
    {
      format: 'table',
      expectedOutput: `+----------+------------------+--------+---------+-------------------------+---------+------+--------+----------------------------------------------------+
| Provider | RuleId           | Source | Service | ResourceId              | Path    | Line | Column | Message                                            |
+----------+------------------+--------+---------+-------------------------+---------+------+--------+----------------------------------------------------+
| aws      | CLDBRN-AWS-EBS-1 | iac    | ebs     | aws_ebs_volume.gp2_logs | main.tf | 4    | 3      | EBS volumes should use current-generation storage. |
+----------+------------------+--------+---------+-------------------------+---------+------+--------+----------------------------------------------------+
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

  it('uses the iac config format when --format is not provided', async () => {
    const fixturePath = fileURLToPath(new URL('../../sdk/test/fixtures/terraform/scan-dir', import.meta.url));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    vi.spyOn(CloudBurnClient.prototype, 'loadConfig').mockResolvedValue({
      discovery: {},
      iac: { format: 'table' },
    });
    vi.spyOn(CloudBurnClient.prototype, 'scanStatic').mockResolvedValue(staticScanResult);

    await createProgram().parseAsync(['scan', fixturePath], { from: 'user' });

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('| Provider |'));
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
    expect(scanStatic).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalled();
  });

  it('rejects text output before running a static scan', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const scanStatic = vi.spyOn(CloudBurnClient.prototype, 'scanStatic').mockResolvedValue(staticScanResult);
    const program = createProgram();
    const scanCommand = program.commands.find((command) => command.name() === 'scan');

    program.exitOverride();
    scanCommand?.exitOverride();

    await expect(program.parseAsync(['scan', '--format', 'text'], { from: 'user' })).rejects.toMatchObject({
      code: 'commander.invalidArgument',
      exitCode: 1,
      message: expect.stringContaining('text'),
    });
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

  it('writes PATH_NOT_FOUND json to stderr when the scan path does not exist', async () => {
    const fixturePath = fileURLToPath(new URL('../../sdk/test/fixtures/terraform/scan-dir', import.meta.url));
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const err = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT', path: '/missing/path' });
    vi.spyOn(CloudBurnClient.prototype, 'scanStatic').mockRejectedValue(err);

    await createProgram().parseAsync(['scan', fixturePath, '--format', 'table'], { from: 'user' });

    expect(process.exitCode).toBe(2);
    const output = (stderr.mock.calls[0]?.[0] as string) ?? '';
    const parsed = JSON.parse(output) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('PATH_NOT_FOUND');
    expect(parsed.error.message).toContain('/missing/path');
  });

  it('writes sanitized RUNTIME_ERROR json to stderr on unexpected scan failures', async () => {
    const fixturePath = fileURLToPath(new URL('../../sdk/test/fixtures/terraform/scan-dir', import.meta.url));
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(CloudBurnClient.prototype, 'scanStatic').mockRejectedValue(
      new Error('YAML parse error in template.yaml at line 12, column 4'),
    );

    await createProgram().parseAsync(['scan', fixturePath], { from: 'user' });

    expect(process.exitCode).toBe(2);
    const output = (stderr.mock.calls[0]?.[0] as string) ?? '';
    const parsed = JSON.parse(output) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('RUNTIME_ERROR');
    expect(parsed.error.message).toBe('YAML parse error in template.yaml at line 12, column 4');
  });

  it('cleans up the progress line before writing runtime errors to stderr', async () => {
    const restoreTTY = setStderrIsTTY(true);
    const fixturePath = fileURLToPath(new URL('../../sdk/test/fixtures/terraform/scan-dir', import.meta.url));
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(CloudBurnClient.prototype, 'scanStatic').mockRejectedValue(
      new Error('YAML parse error in template.yaml at line 12, column 4'),
    );

    try {
      await createProgram().parseAsync(['scan', fixturePath], { from: 'user' });
    } finally {
      restoreTTY();
    }

    const output = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');
    const finalChunk = String(stderr.mock.calls.at(-1)?.[0] ?? '');

    expect(process.exitCode).toBe(2);
    expect(output).toContain('Scan IaC');
    expect(output).toContain('\n{');
    expect(finalChunk).toContain('"code": "RUNTIME_ERROR"');
  });

  it('describes static autodetection in scan help output', () => {
    const program = createProgram();
    const scanCommand = program.commands.find((command) => command.name() === 'scan');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    scanCommand?.outputHelp();

    const help = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(help).toContain('Terraform file, CloudFormation template, or');
    expect(help).toContain('directory to scan');
    expect(help).toContain('cloudburn scan ./main.tf');
    expect(help).toContain('cloudburn scan ./template.yaml');
    expect(help).toContain('cloudburn scan ./iac');
    expect(help).toContain('--config <path>');
    expect(help).toContain('--enabled-rules <ruleIds>');
    expect(help).toContain('When set,');
    expect(help).toContain('CloudBurn checks only these rules');
    expect(help).toContain('By default, all');
    expect(help).toContain('rules are enabled');
    expect(help).toContain('--disabled-rules <ruleIds>');
    expect(help).toContain('--service <services>');
    expect(help).toContain('Comma-separated services');
    expect(help).toContain('use this to exclude');
    expect(help).toContain('specific rules');
    expect(help).not.toContain('--live');
  });
});
