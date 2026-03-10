import { CloudBurnClient } from '@cloudburn/sdk';
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

describe('discover command e2e', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    delete process.env.AWS_REGION;
    delete process.env.AWS_DEFAULT_REGION;
    delete process.env.aws_region;
  });

  it('prints live findings as json and leaves a success exit code', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const discover = vi.spyOn(CloudBurnClient.prototype, 'discover').mockResolvedValue(liveScanResult);

    await createProgram().parseAsync(['discover', '--format', 'json'], { from: 'user' });

    expect(discover).toHaveBeenCalledWith({ target: { mode: 'current' } });
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

  it('passes an explicit region target to the sdk discover method', async () => {
    const discover = vi.spyOn(CloudBurnClient.prototype, 'discover').mockResolvedValue({ providers: [] });

    await createProgram().parseAsync(['discover', '--region', 'eu-central-1'], { from: 'user' });

    expect(discover).toHaveBeenCalledWith({ target: { mode: 'region', region: 'eu-central-1' } });
    expect(process.exitCode).toBe(0);
  });

  it('rejects invalid discovery regions before invoking the sdk', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const discover = vi.spyOn(CloudBurnClient.prototype, 'discover').mockResolvedValue({ providers: [] });

    await expect(
      createProgram().parseAsync(['discover', '--region', 'us-east-1 region:eu-west-1'], { from: 'user' }),
    ).rejects.toThrow('process.exit unexpectedly called with "1"');

    expect(discover).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("Invalid AWS region 'us-east-1 region:eu-west-1'."));
  });

  it('passes the all-regions target to the sdk discover method', async () => {
    const discover = vi.spyOn(CloudBurnClient.prototype, 'discover').mockResolvedValue({ providers: [] });

    await createProgram().parseAsync(['discover', '--region', 'all'], { from: 'user' });

    expect(discover).toHaveBeenCalledWith({ target: { mode: 'all' } });
    expect(process.exitCode).toBe(0);
  });

  it('preserves the policy violation exit code when discover finds resources and --exit-code is set', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(CloudBurnClient.prototype, 'discover').mockResolvedValue(liveScanResult);

    await createProgram().parseAsync(['discover', '--exit-code'], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });

  it('describes region targeting in discover help output', () => {
    const program = createProgram();
    const discoverCommand = program.commands.find((command) => command.name() === 'discover');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    discoverCommand?.outputHelp();

    const help = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(help).toContain('Run a live AWS discovery');
    expect(help).toContain('--region <region>');
    expect(help).toContain('cloudburn discover');
    expect(help).toContain('cloudburn discover --region all');
    expect(help).toContain('cloudburn discover list-enabled-regions');
  });

  it('lists enabled regions via the sdk', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const listEnabledRegions = vi.spyOn(CloudBurnClient.prototype, 'listEnabledDiscoveryRegions').mockResolvedValue([
      { region: 'eu-west-1', type: 'local' },
      { region: 'eu-central-1', type: 'aggregator' },
    ]);

    await createProgram().parseAsync(['discover', 'list-enabled-regions', '--format', 'json'], { from: 'user' });

    expect(listEnabledRegions).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenCalledWith(`[
  {
    "region": "eu-west-1",
    "type": "local"
  },
  {
    "region": "eu-central-1",
    "type": "aggregator"
  }
]\n`);
    expect(process.exitCode).toBe(0);
  });

  it('initializes resource explorer setup via the sdk', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const initializeDiscovery = vi.spyOn(CloudBurnClient.prototype, 'initializeDiscovery').mockResolvedValue({
      status: 'CREATED',
      aggregatorRegion: 'eu-west-1',
      regions: ['eu-west-1'],
    });

    await createProgram().parseAsync(['discover', 'init'], { from: 'user' });

    expect(initializeDiscovery).toHaveBeenCalledWith({ region: undefined });
    expect(stdout).toHaveBeenCalledWith('Resource Explorer setup created in eu-west-1.\n');
    expect(process.exitCode).toBe(0);
  });

  it('passes an explicit valid init region through to the sdk', async () => {
    const initializeDiscovery = vi.spyOn(CloudBurnClient.prototype, 'initializeDiscovery').mockResolvedValue({
      status: 'CREATED',
      aggregatorRegion: 'eu-west-1',
      regions: ['eu-west-1'],
    });

    await createProgram().parseAsync(['discover', 'init', '--region', 'eu-west-1'], { from: 'user' });

    expect(initializeDiscovery).toHaveBeenCalledWith({ region: 'eu-west-1' });
    expect(process.exitCode).toBe(0);
  });

  it('does not forward parent --region all into discover init', async () => {
    const initializeDiscovery = vi.spyOn(CloudBurnClient.prototype, 'initializeDiscovery').mockResolvedValue({
      status: 'CREATED',
      aggregatorRegion: 'eu-west-1',
      regions: ['eu-west-1'],
    });

    await createProgram().parseAsync(['discover', '--region', 'all', 'init'], { from: 'user' });

    expect(initializeDiscovery).toHaveBeenCalledWith({ region: undefined });
    expect(process.exitCode).toBe(0);
  });

  it('rejects invalid init regions before invoking the sdk', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const initializeDiscovery = vi
      .spyOn(CloudBurnClient.prototype, 'initializeDiscovery')
      .mockResolvedValue({ status: 'CREATED', aggregatorRegion: 'eu-west-1', regions: ['eu-west-1'] });

    await expect(
      createProgram().parseAsync(['discover', 'init', '--region', 'eu-central-1 tag:Owner=alice'], { from: 'user' }),
    ).rejects.toThrow('process.exit unexpectedly called with "1"');

    expect(initializeDiscovery).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("Invalid AWS region 'eu-central-1 tag:Owner=alice'."));
  });

  it('writes CREDENTIALS_ERROR json to stderr on AWS credential failures', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const err = new Error('Could not load credentials');
    err.name = 'CredentialsProviderError';
    vi.spyOn(CloudBurnClient.prototype, 'discover').mockRejectedValue(err);

    await createProgram().parseAsync(['discover'], { from: 'user' });

    expect(process.exitCode).toBe(2);
    const output = (stderr.mock.calls[0]?.[0] as string) ?? '';
    const parsed = JSON.parse(output) as { error: { code: string } };
    expect(parsed.error.code).toBe('CREDENTIALS_ERROR');
  });

  it('writes a setup-specific error payload for disabled resource explorer', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const err = Object.assign(
      new Error(
        "AWS Resource Explorer is not enabled. Enable it first: https://docs.aws.amazon.com/resource-explorer/latest/userguide/getting-started-setting-up.html or run 'cloudburn discover init'.",
      ),
      {
        code: 'RESOURCE_EXPLORER_NOT_ENABLED',
      },
    );
    vi.spyOn(CloudBurnClient.prototype, 'discover').mockRejectedValue(err);

    await createProgram().parseAsync(['discover'], { from: 'user' });

    expect(process.exitCode).toBe(2);
    const output = (stderr.mock.calls[0]?.[0] as string) ?? '';
    const parsed = JSON.parse(output) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('RESOURCE_EXPLORER_NOT_ENABLED');
    expect(parsed.error.message).toContain('cloudburn discover init');
    expect(parsed.error.message).toContain('docs.aws.amazon.com/resource-explorer');
  });
});
