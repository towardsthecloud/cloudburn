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

const liveScanResultWithDiagnostic = {
  providers: liveScanResult.providers,
  diagnostics: [
    {
      code: 'AccessDeniedException',
      details:
        'AWS Lambda GetFunctionConfiguration failed in us-east-1 with AccessDeniedException: Access denied by SCP. Request ID: req-123.',
      message: 'Skipped lambda discovery in us-east-1 because access is denied by a service control policy (SCP).',
      provider: 'aws' as const,
      region: 'us-east-1',
      service: 'lambda',
      source: 'discovery' as const,
      status: 'access_denied' as const,
    },
  ],
};

const observedAggregatorStatus = {
  aggregatorRegion: 'eu-west-1',
  accessibleRegionCount: 3,
  coverage: 'partial' as const,
  indexedRegionCount: 3,
  regions: [
    {
      region: 'eu-west-1',
      indexType: 'aggregator' as const,
      isAggregator: true,
      status: 'indexed' as const,
      viewStatus: 'present' as const,
    },
    {
      region: 'us-east-1',
      indexType: 'local' as const,
      status: 'indexed' as const,
      viewStatus: 'present' as const,
    },
    {
      region: 'eu-central-1',
      indexType: 'local' as const,
      status: 'indexed' as const,
      viewStatus: 'present' as const,
    },
    {
      region: 'ap-south-1',
      status: 'access_denied' as const,
      errorCode: 'AccessDeniedException',
      notes: 'Access denied. This may be intentional if SCPs restrict regional Resource Explorer access.',
    },
  ],
  totalRegionCount: 17,
  warning:
    'Discovery coverage is limited. 14 of 17 regions could not be inspected, which may be intentional if SCPs restrict regional Resource Explorer access.',
};

const observedLocalStatus = {
  aggregatorRegion: 'eu-central-1',
  accessibleRegionCount: 1,
  coverage: 'local_only' as const,
  indexedRegionCount: 1,
  regions: [
    {
      region: 'eu-central-1',
      indexType: 'local' as const,
      status: 'indexed' as const,
      viewStatus: 'present' as const,
    },
    {
      region: 'us-east-1',
      status: 'access_denied' as const,
      errorCode: 'AccessDeniedException',
      notes: 'Access denied. This may be intentional if SCPs restrict regional Resource Explorer access.',
    },
  ],
  totalRegionCount: 17,
  warning:
    'Discovery coverage is limited. 16 of 17 regions could not be inspected, which may be intentional if SCPs restrict regional Resource Explorer access.',
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

  it('writes discover progress to stderr during interactive runs without changing stdout output', async () => {
    const restoreTTY = setStderrIsTTY(true);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const discover = vi.spyOn(CloudBurnClient.prototype, 'discover').mockResolvedValue(liveScanResult);

    try {
      await createProgram().parseAsync(['discover', '--format', 'json'], { from: 'user' });
    } finally {
      restoreTTY();
    }

    const progressOutput = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(discover).toHaveBeenCalledWith({ target: { mode: 'current' } });
    expect(progressOutput).toContain('Load config');
    expect(progressOutput).toContain('Discover resources');
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

    expect(discover).toHaveBeenCalledWith({ target: { mode: 'regions', regions: ['eu-central-1'] } });
    expect(process.exitCode).toBe(0);
  });

  it('writes sdk debug tracing to stderr without adding cli-originated debug lines', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(CloudBurnClient.prototype, 'loadConfig').mockImplementation(async function () {
      (this as { options?: { debugLogger?: (message: string) => void } }).options?.debugLogger?.(
        'sdk: loading config from default search path',
      );

      return {
        discovery: {},
        iac: {},
      };
    });
    vi.spyOn(CloudBurnClient.prototype, 'discover').mockImplementation(async function () {
      (this as { options?: { debugLogger?: (message: string) => void } }).options?.debugLogger?.(
        'sdk: starting live discovery scan',
      );

      return { providers: [] };
    });

    await createProgram().parseAsync(['discover', '--debug'], { from: 'user' });

    const debugOutput = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(debugOutput).toContain('[debug] sdk: loading config from default search path');
    expect(debugOutput).toContain('[debug] sdk: starting live discovery scan');
    expect(debugOutput).not.toContain('[debug] discover:');
    expect(stdout).toHaveBeenCalledWith('No findings.\n');
  });

  it('rejects invalid discovery regions before invoking the sdk', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const discover = vi.spyOn(CloudBurnClient.prototype, 'discover').mockResolvedValue({ providers: [] });

    await expect(
      createProgram().parseAsync(['discover', '--region', 'totally-fake-1'], { from: 'user' }),
    ).rejects.toThrow('process.exit unexpectedly called with "1"');

    expect(discover).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("Invalid AWS region 'totally-fake-1'."));
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Supported regions:'));
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('eu-central-1'));
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('us-east-1'));
  });

  it('rejects invalid service filters before invoking the sdk discover method', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const discover = vi.spyOn(CloudBurnClient.prototype, 'discover').mockResolvedValue({ providers: [] });
    const program = createProgram();
    const discoverCommand = program.commands.find((command) => command.name() === 'discover');

    program.exitOverride();
    discoverCommand?.exitOverride();

    await expect(program.parseAsync(['discover', '--service', 'invalid'], { from: 'user' })).rejects.toMatchObject({
      code: 'commander.invalidArgument',
      exitCode: 1,
      message: expect.stringContaining('Unknown service "invalid" for discovery'),
    });
    expect(discover).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalled();
  });

  it('rejects all as a discovery region value', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const discover = vi.spyOn(CloudBurnClient.prototype, 'discover').mockResolvedValue({ providers: [] });

    await expect(createProgram().parseAsync(['discover', '--region', 'all'], { from: 'user' })).rejects.toThrow(
      'process.exit unexpectedly called with "1"',
    );

    expect(discover).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("Invalid AWS region 'all'."));
  });

  it('rejects comma-separated discovery regions in the cli before invoking the sdk', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const discover = vi.spyOn(CloudBurnClient.prototype, 'discover').mockResolvedValue({ providers: [] });

    await expect(
      createProgram().parseAsync(['discover', '--region', 'eu-central-1,us-east-1'], { from: 'user' }),
    ).rejects.toThrow('process.exit unexpectedly called with "1"');

    expect(discover).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("Invalid AWS region 'eu-central-1,us-east-1'."));
  });

  it('preserves the policy violation exit code when discover finds resources and --exit-code is set', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(CloudBurnClient.prototype, 'discover').mockResolvedValue(liveScanResult);

    await createProgram().parseAsync(['discover', '--exit-code'], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });

  it('renders service diagnostics without aborting the discover output', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(CloudBurnClient.prototype, 'discover').mockResolvedValue(liveScanResultWithDiagnostic);

    await createProgram().parseAsync(['discover'], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(output).toContain('CLDBRN-AWS-EBS-1');
    expect(output).toContain('lambda');
    expect(output).toContain('Skipped lambda discovery in us-east-1');
    expect(process.exitCode).toBe(0);
  });

  it('uses the discovery config format when --format is not provided', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    vi.spyOn(CloudBurnClient.prototype, 'loadConfig').mockResolvedValue({
      discovery: { format: 'table' },
      iac: {},
    });
    vi.spyOn(CloudBurnClient.prototype, 'discover').mockResolvedValue(liveScanResult);

    await createProgram().parseAsync(['discover'], { from: 'user' });

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('| Provider |'));
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

  it('passes comma-separated service overrides to the sdk discover method', async () => {
    vi.spyOn(CloudBurnClient.prototype, 'loadConfig').mockResolvedValue({
      discovery: {},
      iac: {},
    });
    const discover = vi.spyOn(CloudBurnClient.prototype, 'discover').mockResolvedValue(liveScanResult);

    await createProgram().parseAsync(['discover', '--service', 'ec2,s3'], { from: 'user' });

    expect(discover).toHaveBeenCalledWith({
      config: {
        discovery: {
          services: ['ec2', 's3'],
        },
      },
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
    expect(help).toContain('AWS region to discover. Defaults');
    expect(help).toContain('AWS region from AWS_REGION');
    expect(help).toContain('omitted.');
    expect(help).not.toContain('--regions <regions>');
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
    expect(help).toContain('cloudburn discover');
    expect(help).toContain('cloudburn discover --region eu-central-1');
  });

  it('initializes resource explorer setup via the sdk', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const initializeDiscovery = vi.spyOn(CloudBurnClient.prototype, 'initializeDiscovery').mockResolvedValue({
      aggregatorAction: 'created',
      status: 'CREATED',
      aggregatorRegion: 'eu-west-1',
      coverage: 'partial',
      createdIndexCount: 3,
      indexType: 'aggregator',
      observedStatus: observedAggregatorStatus,
      regions: ['eu-west-1', 'us-east-1', 'eu-central-1'],
      reusedIndexCount: 0,
      verificationStatus: 'verified',
    });

    await createProgram().parseAsync(['discover', 'init'], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(initializeDiscovery).toHaveBeenCalledWith({ region: undefined });
    expect(output).toContain('Configured eu-west-1 as the Resource Explorer aggregator.');
    expect(output).toContain('Created 3 indexes.');
    expect(output).toContain('aggregatorRegion');
    expect(output).toContain('aggregatorAction');
    expect(output).toContain('eu-west-1');
    expect(output).toContain('coverage');
    expect(output).toContain('createdIndexes');
    expect(output).toContain('3');
    expect(output).toContain('partial');
    expect(output).toContain('indexedSummary');
    expect(output).toContain('3 of 17');
    expect(output).toContain('reusedIndexes');
    expect(output).toContain('0');
    expect(output).toContain('restrictedRegions');
    expect(output).toContain('14');
    expect(output).toContain('Run `cloudburn discover status` for per-region details.');
    expect(output).not.toContain('observedStatus');
    expect(process.exitCode).toBe(0);
  });

  it('formats discover init as structured json', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(CloudBurnClient.prototype, 'initializeDiscovery').mockResolvedValue({
      aggregatorAction: 'created',
      status: 'CREATED',
      aggregatorRegion: 'eu-west-1',
      coverage: 'partial',
      createdIndexCount: 3,
      indexType: 'aggregator',
      observedStatus: observedAggregatorStatus,
      regions: ['eu-west-1', 'us-east-1', 'eu-central-1'],
      reusedIndexCount: 0,
      taskId: 'task-123',
      verificationStatus: 'verified',
    });

    await createProgram().parseAsync(['discover', 'init', '--format', 'json'], { from: 'user' });

    expect(stdout).toHaveBeenCalledWith(`{
  "aggregatorAction": "created",
  "aggregatorRegion": "eu-west-1",
  "coverage": "partial",
  "createdIndexCount": 3,
  "indexType": "aggregator",
  "message": "Configured eu-west-1 as the Resource Explorer aggregator. Created 3 indexes. Discovery coverage is limited. 14 of 17 regions could not be inspected, which may be intentional if SCPs restrict regional Resource Explorer access.",
  "observedStatus": {
    "aggregatorRegion": "eu-west-1",
    "accessibleRegionCount": 3,
    "coverage": "partial",
    "indexedRegionCount": 3,
    "regions": [
      {
        "region": "eu-west-1",
        "indexType": "aggregator",
        "isAggregator": true,
        "status": "indexed",
        "viewStatus": "present"
      },
      {
        "region": "us-east-1",
        "indexType": "local",
        "status": "indexed",
        "viewStatus": "present"
      },
      {
        "region": "eu-central-1",
        "indexType": "local",
        "status": "indexed",
        "viewStatus": "present"
      },
      {
        "region": "ap-south-1",
        "status": "access_denied",
        "errorCode": "AccessDeniedException",
        "notes": "Access denied. This may be intentional if SCPs restrict regional Resource Explorer access."
      }
    ],
    "totalRegionCount": 17,
    "warning": "Discovery coverage is limited. 14 of 17 regions could not be inspected, which may be intentional if SCPs restrict regional Resource Explorer access."
  },
  "regions": [
    "eu-west-1",
    "us-east-1",
    "eu-central-1"
  ],
  "reusedIndexCount": 0,
  "status": "CREATED",
  "taskId": "task-123",
  "verificationStatus": "verified"
}\n`);
    expect(process.exitCode).toBe(0);
  });

  it('passes an explicit valid init region through to the sdk', async () => {
    const initializeDiscovery = vi.spyOn(CloudBurnClient.prototype, 'initializeDiscovery').mockResolvedValue({
      aggregatorAction: 'created',
      status: 'CREATED',
      aggregatorRegion: 'eu-west-1',
      coverage: 'partial',
      createdIndexCount: 3,
      indexType: 'aggregator',
      observedStatus: observedAggregatorStatus,
      regions: ['eu-west-1', 'us-east-1', 'eu-central-1'],
      reusedIndexCount: 0,
      verificationStatus: 'verified',
    });

    await createProgram().parseAsync(['discover', 'init', '--region', 'eu-west-1'], { from: 'user' });

    expect(initializeDiscovery).toHaveBeenCalledWith({ region: 'eu-west-1' });
    expect(process.exitCode).toBe(0);
  });

  it('does not forward discover region into discover init', async () => {
    const initializeDiscovery = vi.spyOn(CloudBurnClient.prototype, 'initializeDiscovery').mockResolvedValue({
      aggregatorAction: 'created',
      status: 'CREATED',
      aggregatorRegion: 'eu-west-1',
      coverage: 'partial',
      createdIndexCount: 3,
      indexType: 'aggregator',
      observedStatus: observedAggregatorStatus,
      regions: ['eu-west-1', 'us-east-1', 'eu-central-1'],
      reusedIndexCount: 0,
      verificationStatus: 'verified',
    });

    await createProgram().parseAsync(['discover', '--region', 'eu-central-1', 'init'], { from: 'user' });

    expect(initializeDiscovery).toHaveBeenCalledWith({ region: undefined });
    expect(process.exitCode).toBe(0);
  });

  it('does not forward discover region into discover status', async () => {
    const getDiscoveryStatus = vi
      .spyOn(CloudBurnClient.prototype, 'getDiscoveryStatus')
      .mockResolvedValue(observedAggregatorStatus);

    await createProgram().parseAsync(['discover', '--region', 'eu-central-1', 'status'], { from: 'user' });

    expect(getDiscoveryStatus).toHaveBeenCalledWith({ region: undefined });
    expect(process.exitCode).toBe(0);
  });

  it('rejects invalid init regions before invoking the sdk', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const initializeDiscovery = vi.spyOn(CloudBurnClient.prototype, 'initializeDiscovery').mockResolvedValue({
      aggregatorAction: 'created',
      status: 'CREATED',
      aggregatorRegion: 'eu-west-1',
      coverage: 'partial',
      createdIndexCount: 3,
      indexType: 'aggregator',
      observedStatus: observedAggregatorStatus,
      regions: ['eu-west-1', 'us-east-1', 'eu-central-1'],
      reusedIndexCount: 0,
      verificationStatus: 'verified',
    });

    await expect(
      createProgram().parseAsync(['discover', 'init', '--region', 'eu-central-1 tag:Owner=alice'], { from: 'user' }),
    ).rejects.toThrow('process.exit unexpectedly called with "1"');

    expect(initializeDiscovery).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("Invalid AWS region 'eu-central-1 tag:Owner=alice'."));
  });

  it('renders local-only discover init results clearly', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(CloudBurnClient.prototype, 'initializeDiscovery').mockResolvedValue({
      aggregatorAction: 'none',
      status: 'EXISTING',
      aggregatorRegion: 'eu-central-1',
      coverage: 'local_only',
      createdIndexCount: 0,
      indexType: 'local',
      observedStatus: observedLocalStatus,
      regions: ['eu-central-1'],
      reusedIndexCount: 1,
      warning:
        'Cross-region Resource Explorer setup could not be created; using the existing local index in eu-central-1.',
      verificationStatus: 'verified',
    });

    await createProgram().parseAsync(['discover', 'init'], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(output).toContain('Local Resource Explorer setup already exists in eu-central-1.');
    expect(output).toContain('Reused 1 existing index.');
    expect(output).toContain('Cross-region Resource Explorer setup could not be created; using the existing local');
    expect(output).toContain('index in eu-central-1.');
    expect(output).toContain(
      'Discovery coverage is limited. 16 of 17 regions could not be inspected, which may be intentional if SCPs restrict regional Resource Explorer access.',
    );
    expect(output).toContain('Run `cloudburn discover status` for per-region details.');
    expect(output).not.toContain('observedStatus');
    expect(process.exitCode).toBe(0);
  });

  it('shows discovery status across enabled regions', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const getDiscoveryStatus = vi
      .spyOn(CloudBurnClient.prototype, 'getDiscoveryStatus')
      .mockResolvedValue(observedAggregatorStatus);

    await createProgram().parseAsync(['discover', 'status'], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(getDiscoveryStatus).toHaveBeenCalledWith({ region: undefined });
    expect(output).toContain('aggregatorRegion');
    expect(output).toContain('eu-west-1');
    expect(output).toContain('coverage');
    expect(output).toContain('partial');
    expect(output).toContain('aggregator (active)');
    expect(output).toContain('access_denied');
    expect(process.exitCode).toBe(0);
  });

  it('formats discovery status as structured json', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(CloudBurnClient.prototype, 'getDiscoveryStatus').mockResolvedValue(observedAggregatorStatus);

    await createProgram().parseAsync(['discover', 'status', '--format', 'json'], { from: 'user' });

    expect(stdout).toHaveBeenCalledWith(`{
  "summary": {
    "accessibleRegionCount": 3,
    "coverage": "partial",
    "indexedRegionCount": 3,
    "totalRegionCount": 17,
    "aggregatorRegion": "eu-west-1",
    "warning": "Discovery coverage is limited. 14 of 17 regions could not be inspected, which may be intentional if SCPs restrict regional Resource Explorer access."
  },
  "regions": [
    {
      "region": "eu-west-1",
      "indexType": "aggregator",
      "isAggregator": true,
      "status": "indexed",
      "viewStatus": "present",
      "notes": ""
    },
    {
      "region": "us-east-1",
      "indexType": "local",
      "status": "indexed",
      "viewStatus": "present",
      "notes": ""
    },
    {
      "region": "eu-central-1",
      "indexType": "local",
      "status": "indexed",
      "viewStatus": "present",
      "notes": ""
    },
    {
      "region": "ap-south-1",
      "status": "access_denied",
      "errorCode": "AccessDeniedException",
      "notes": "Access denied. This may be intentional if SCPs restrict regional Resource Explorer access."
    }
  ]
}\n`);
    expect(process.exitCode).toBe(0);
  });

  it('omits aggregatorRegion from discovery status json when no aggregator is observed', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(CloudBurnClient.prototype, 'getDiscoveryStatus').mockResolvedValue({
      accessibleRegionCount: 1,
      coverage: 'local_only',
      indexedRegionCount: 1,
      regions: [
        {
          region: 'eu-central-1',
          indexType: 'local',
          status: 'indexed',
          viewStatus: 'present',
        },
      ],
      totalRegionCount: 1,
    });

    await createProgram().parseAsync(['discover', 'status', '--format', 'json'], { from: 'user' });

    const payload = JSON.parse((stdout.mock.calls[0]?.[0] as string) ?? '{}') as {
      summary: Record<string, unknown>;
    };

    expect(payload.summary).not.toHaveProperty('aggregatorRegion');
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

  it('rejects text output for supported resource types before invoking the sdk', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const listSupportedResourceTypes = vi
      .spyOn(CloudBurnClient.prototype, 'listSupportedDiscoveryResourceTypes')
      .mockResolvedValue([{ resourceType: 'AWS::EC2::Instance', service: 'ec2' }, { resourceType: 'AWS::S3::Bucket' }]);
    const program = createProgram();
    const discoverCommand = program.commands.find((command) => command.name() === 'discover');
    const supportedTypesCommand = discoverCommand?.commands.find(
      (command) => command.name() === 'supported-resource-types',
    );

    program.exitOverride();
    discoverCommand?.exitOverride();
    supportedTypesCommand?.exitOverride();

    await expect(
      program.parseAsync(['discover', 'supported-resource-types', '--format', 'text'], { from: 'user' }),
    ).rejects.toMatchObject({
      code: 'commander.invalidArgument',
      exitCode: 1,
      message: expect.stringContaining('text'),
    });
    expect(listSupportedResourceTypes).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalled();
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
