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

  it('accepts the global root format flag for discovery scans', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const discover = vi.spyOn(CloudBurnClient.prototype, 'discover').mockResolvedValue(liveScanResult);

    await createProgram().parseAsync(['--format', 'json', 'discover'], { from: 'user' });

    expect(discover).toHaveBeenCalledWith({ target: { mode: 'current' } });
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"source": "discovery"'));
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

  it('uses the discovery config format when --format is not provided', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    vi.spyOn(CloudBurnClient.prototype, 'loadConfig').mockResolvedValue({
      discovery: { format: 'text' },
      iac: {},
    });
    vi.spyOn(CloudBurnClient.prototype, 'discover').mockResolvedValue(liveScanResult);

    await createProgram().parseAsync(['discover'], { from: 'user' });

    expect(stdout).toHaveBeenCalledWith(
      'aws\tCLDBRN-AWS-EBS-1\tdiscovery\tebs\tvol-123\t\tus-east-1\t\t\t\tEBS volumes should use current-generation storage.\n',
    );
    expect(process.exitCode).toBe(0);
  });

  it('passes comma-separated rule overrides and an explicit config path to the sdk discover method', async () => {
    const configPath = '/tmp/cloudburn-discovery.yml';

    vi.spyOn(CloudBurnClient.prototype, 'loadConfig').mockResolvedValue({
      discovery: {},
      iac: {},
    });
    const discover = vi.spyOn(CloudBurnClient.prototype, 'discover').mockResolvedValue(liveScanResult);

    await createProgram().parseAsync(
      [
        'discover',
        '--config',
        configPath,
        '--enabled-rules',
        'CLDBRN-AWS-EBS-1,CLDBRN-AWS-EC2-1',
        '--disabled-rules',
        'CLDBRN-AWS-S3-1',
      ],
      { from: 'user' },
    );

    expect(discover).toHaveBeenCalledWith({
      config: {
        discovery: {
          disabledRules: ['CLDBRN-AWS-S3-1'],
          enabledRules: ['CLDBRN-AWS-EBS-1', 'CLDBRN-AWS-EC2-1'],
        },
      },
      configPath,
      target: { mode: 'current' },
    });
    expect(process.exitCode).toBe(0);
  });

  it('describes region targeting in discover help output', () => {
    const program = createProgram();
    const discoverCommand = program.commands.find((command) => command.name() === 'discover');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    discoverCommand?.outputHelp();

    const help = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(help).toContain('Run a live AWS discovery');
    expect(help).toContain('--region <region>');
    expect(help).toContain('--config <path>');
    expect(help).toContain('--enabled-rules <ruleIds>');
    expect(help).toContain('--disabled-rules <ruleIds>');
    expect(help).toContain('text: tab-delimited');
    expect(help).toContain('grep, sed,');
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

  it('formats enabled regions as text and respects parent discover format compatibility', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(CloudBurnClient.prototype, 'listEnabledDiscoveryRegions').mockResolvedValue([
      { region: 'eu-west-1', type: 'local' },
      { region: 'eu-central-1', type: 'aggregator' },
    ]);

    await createProgram().parseAsync(['discover', '--format', 'text', 'list-enabled-regions'], { from: 'user' });

    expect(stdout).toHaveBeenCalledWith('eu-west-1\tlocal\neu-central-1\taggregator\n');
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
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('Resource Explorer setup created in eu-west-1.'));
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('| aggregatorRegion | eu-west-1'));
    expect(process.exitCode).toBe(0);
  });

  it('formats discover init as structured json', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(CloudBurnClient.prototype, 'initializeDiscovery').mockResolvedValue({
      status: 'CREATED',
      aggregatorRegion: 'eu-west-1',
      regions: ['eu-west-1'],
      taskId: 'task-123',
    });

    await createProgram().parseAsync(['discover', 'init', '--format', 'json'], { from: 'user' });

    expect(stdout).toHaveBeenCalledWith(`{
  "aggregatorRegion": "eu-west-1",
  "message": "Resource Explorer setup created in eu-west-1.",
  "regions": [
    "eu-west-1"
  ],
  "status": "CREATED",
  "taskId": "task-123"
}\n`);
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

  it('formats supported resource types via the shared formatter system', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(CloudBurnClient.prototype, 'listSupportedDiscoveryResourceTypes').mockResolvedValue([
      { resourceType: 'AWS::EC2::Instance', service: 'ec2' },
      { resourceType: 'AWS::S3::Bucket' },
    ]);

    await createProgram().parseAsync(['discover', 'supported-resource-types', '--format', 'text'], { from: 'user' });

    expect(stdout).toHaveBeenCalledWith('AWS::EC2::Instance\tec2\nAWS::S3::Bucket\tunknown\n');
    expect(process.exitCode).toBe(0);
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
