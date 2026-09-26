import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  type AwsDiscoveryProgressEvent,
  assertSupportedAwsRegion,
  builtInRuleMetadata,
  CloudBurnClient,
  SEVERITIES,
} from '@cloudburn/sdk';
import { type CallToolResult, McpServer, type ServerContext } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { toToolError, toToolResult } from './error.js';
import { requireAbsolutePath, ruleSelectionShape, toConfigOverride } from './options.js';
import { SERVER_VERSION } from './version.js';

/** Dependencies the server needs from its host; tests replace the SDK client factory. */
export type CloudBurnServerOptions = {
  /** Creates the SDK client used by one tool call. */
  createClient?: () => CloudBurnClient;
  /** Environment used to resolve the per-user evidence cache directory. */
  env?: NodeJS.ProcessEnv;
};

const INSTRUCTIONS = [
  'CloudBurn finds AWS cost waste. Use scan_iac for Terraform and CloudFormation files; it needs no AWS access.',
  'Use discover for live AWS resources in the account and region of the AWS credentials the server was started with.',
  'discover needs AWS Resource Explorer; if it reports missing setup, check discovery_status and ask the user to run',
  '`cloudburn discover init` themselves. Every tool is read-only and returns JSON.',
].join(' ');

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;

const run = async (action: () => Promise<unknown>): Promise<CallToolResult> => {
  try {
    return toToolResult(await action());
  } catch (err) {
    return toToolError(err);
  }
};

const describeProgress = (event: AwsDiscoveryProgressEvent): string => {
  switch (event.kind) {
    case 'catalog':
      return `Catalog ready with ${event.resourceCount} resources from ${event.searchRegion}`;
    case 'dataset':
      return `Datasets ${event.completedDatasets}/${event.totalDatasets} loaded (${event.datasetKey})`;
    case 'rule':
      return `Rules ${event.completedRules}/${event.totalRules} evaluated (${event.ruleId}: ${event.status}, provisional)`;
  }
};

const createProgressReporter = (ctx: ServerContext): ((event: AwsDiscoveryProgressEvent) => void) | undefined => {
  const progressToken = ctx.mcpReq._meta?.progressToken;
  if (progressToken === undefined) {
    return undefined;
  }

  let progress = 0;
  return (event) => {
    progress += 1;
    // Progress is advisory; a closed stream must never fail the discovery run.
    ctx.mcpReq
      .notify({
        method: 'notifications/progress',
        params: { progressToken, progress, message: describeProgress(event) },
      })
      .catch(() => undefined);
  };
};

/**
 * Creates the CloudBurn MCP server with its read-only scan, discovery, and rule catalog tools.
 * Tool semantics mirror the `cloudburn` CLI commands of the same purpose; results use the SDK's JSON shapes.
 *
 * @param options - Optional SDK client factory and environment, used by tests.
 * @returns A configured server ready to connect to a transport.
 */
export const createCloudBurnServer = (options: CloudBurnServerOptions = {}): McpServer => {
  const createClient = options.createClient ?? (() => new CloudBurnClient());
  const env = options.env ?? process.env;
  const server = new McpServer(
    { name: 'cloudburn', version: SERVER_VERSION },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );

  server.registerTool(
    'scan_iac',
    {
      title: 'Scan IaC for cost issues',
      description:
        'Scan Terraform files, CloudFormation templates, or a directory of them for AWS cost issues before deployment. ' +
        'Runs locally without AWS credentials. Returns findings grouped by provider and rule, with file locations, ' +
        'plus suppressed findings and parse diagnostics.',
      inputSchema: z.object({
        path: z
          .string()
          .min(1)
          .describe('Absolute path of the Terraform file, CloudFormation template, or directory to scan.'),
        ...ruleSelectionShape,
      }),
      annotations: { ...readOnly, openWorldHint: false },
    },
    async ({ path, configPath, ...selection }) =>
      run(async () => {
        requireAbsolutePath(path, 'path');
        requireAbsolutePath(configPath, 'configPath');
        const config = toConfigOverride('iac', selection);
        return createClient().scanStatic(path, config, configPath === undefined ? undefined : { configPath });
      }),
  );

  server.registerTool(
    'discover',
    {
      title: 'Discover live AWS cost issues',
      description:
        'Evaluate live AWS resources in one region with the ambient AWS credentials (AWS_PROFILE, AWS_REGION, or SSO ' +
        'session). Read-only AWS API calls only. Requires AWS Resource Explorer; see discovery_status. ' +
        'Runs up to five minutes by default and reuses the per-user evidence cache shared with the cloudburn CLI.',
      inputSchema: z.object({
        region: z
          .string()
          .optional()
          .describe('AWS region to discover, for example "eu-central-1". Defaults to the current AWS region.'),
        timeoutSeconds: z
          .number()
          .int()
          .min(1)
          .max(2_147_483)
          .optional()
          .describe('Maximum discovery duration in seconds. Defaults to 300.'),
        cache: z
          .enum(['normal', 'refresh', 'off'])
          .optional()
          .describe('Evidence cache mode: normal reuses fresh evidence, refresh recollects, off bypasses the cache.'),
        ...ruleSelectionShape,
      }),
      annotations: { ...readOnly, openWorldHint: true },
    },
    async ({ region, timeoutSeconds, cache, configPath, ...selection }, ctx) =>
      run(async () => {
        requireAbsolutePath(configPath, 'configPath');
        const config = toConfigOverride('discovery', selection);
        const onProgress = createProgressReporter(ctx);
        return createClient().discover({
          cache: {
            mode: cache ?? 'normal',
            directory: join(env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'cloudburn', 'evidence'),
          },
          target:
            region === undefined
              ? { mode: 'current' }
              : { mode: 'regions', regions: [assertSupportedAwsRegion(region)] },
          signal: ctx.mcpReq.signal,
          ...(config === undefined ? {} : { config }),
          ...(configPath === undefined ? {} : { configPath }),
          ...(onProgress === undefined ? {} : { onProgress }),
          ...(timeoutSeconds === undefined ? {} : { timeoutMs: timeoutSeconds * 1_000 }),
        });
      }),
  );

  server.registerTool(
    'discovery_status',
    {
      title: 'Check live discovery setup',
      description:
        'Show AWS Resource Explorer index status across enabled regions for the ambient AWS credentials. ' +
        'Use it when discover reports missing or partial setup.',
      annotations: { ...readOnly, openWorldHint: true },
    },
    async (ctx) => run(async () => createClient().getDiscoveryStatus({ signal: ctx.mcpReq.signal })),
  );

  server.registerTool(
    'list_rules',
    {
      title: 'List CloudBurn rules',
      description: 'List built-in CloudBurn rules with their IDs, services, severities, and supported scan sources.',
      inputSchema: z.object({
        services: z.array(z.string().min(1)).min(1).optional().describe('Services to include, for example ["ec2"].'),
        sources: z
          .array(z.enum(['iac', 'discovery']))
          .min(1)
          .optional()
          .describe('Scan sources to include.'),
        severity: z.enum(SEVERITIES).optional().describe('Severity to include.'),
      }),
      annotations: { ...readOnly, openWorldHint: false },
    },
    async ({ services, sources, severity }) =>
      run(async () => {
        const selectedServices = services?.map((service) => service.toLowerCase());
        return builtInRuleMetadata.filter(
          (rule) =>
            (selectedServices === undefined || selectedServices.includes(rule.service)) &&
            (sources === undefined || sources.some((source) => rule.supports.includes(source))) &&
            (severity === undefined || rule.severity === severity),
        );
      }),
  );

  return server;
};
