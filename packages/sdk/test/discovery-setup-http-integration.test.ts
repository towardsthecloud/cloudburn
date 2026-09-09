import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EC2Client } from '@aws-sdk/client-ec2';
import { ResourceExplorer2Client } from '@aws-sdk/client-resource-explorer-2';
import { STSClient } from '@aws-sdk/client-sts';
import type { HttpHandlerOptions, HttpRequest } from '@aws-sdk/types';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CloudBurnClient } from '../src/index.js';

const credentials = { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-setup-test-key' };
const region = 'eu-west-1';
const viewArn = 'arn:aws:resource-explorer-2:eu-west-1:222222222222:view/default/00000000-0000-0000-0000-000000000000';
const fixture = (name: string): Buffer =>
  Buffer.from(readFileSync(new URL(`./fixtures/aws-discovery/${name}`, import.meta.url), 'utf8'));
const jsonResponse = (body: unknown) => ({
  response: {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify(body)),
  },
});
let initialized: boolean;
let includedProperties: { Name: string }[];
let requests: Array<{ operation: string; input: Record<string, unknown> }>;
let unexpected: string[];
let admissionDirectory: string;
let holdSecondSetupPage: boolean;
let heldSignal: AbortSignal | undefined;

beforeEach(() => {
  initialized = false;
  includedProperties = [{ Name: 'custom-property' }];
  requests = [];
  unexpected = [];
  holdSecondSetupPage = false;
  heldSignal = undefined;
  admissionDirectory = mkdtempSync(join(tmpdir(), 'cloudburn-setup-http-'));
  vi.stubEnv('CLOUDBURN_AWS_ADMISSION_DIR', admissionDirectory);
  vi.stubEnv(
    'CLOUDBURN_AWS_QUOTA_OVERRIDES',
    JSON.stringify({ 'resource-explorer-2:non-search': { ratePerSecond: 100, burst: 100 } }),
  );
  vi.stubEnv('AWS_REGION', '');
  vi.stubEnv('AWS_DEFAULT_REGION', '');
  vi.stubEnv('aws_region', '');
  vi.stubEnv('AWS_CONFIG_FILE', '/dev/null');
  vi.stubEnv('AWS_SHARED_CREDENTIALS_FILE', '/dev/null');
  const probe = new EC2Client({ region });
  const transport: typeof probe.config.requestHandler = Object.getPrototypeOf(probe.config.requestHandler);
  probe.destroy();
  vi.spyOn(transport, 'handle').mockImplementation(async (request: HttpRequest, options?: HttpHandlerOptions) => {
    const body = String(request.body || '');
    const operation = request.path === '/' ? new URLSearchParams(body).get('Action') || '' : request.path.slice(1);
    const input: Record<string, unknown> =
      request.path === '/' ? Object.fromEntries(new URLSearchParams(body)) : JSON.parse(body || '{}');
    requests.push({ operation, input });
    if (request.hostname === `sts.${region}.amazonaws.com` && operation === 'GetCallerIdentity') {
      return {
        response: { statusCode: 200, headers: { 'content-type': 'text/xml' }, body: fixture('caller-identity.xml') },
      };
    }
    if (request.hostname === `ec2.${region}.amazonaws.com` && operation === 'DescribeRegions') {
      return { response: { statusCode: 200, headers: { 'content-type': 'text/xml' }, body: fixture('regions.xml') } };
    }
    if (request.hostname === `resource-explorer-2.${region}.amazonaws.com`) {
      if (operation === 'ListIndexes')
        return jsonResponse({ Indexes: initialized ? [{ Region: region, Type: 'AGGREGATOR' }] : [] });
      if (operation === 'CreateResourceExplorerSetup') return jsonResponse({ TaskId: 'synthetic-setup-task' });
      if (operation === 'GetResourceExplorerSetup') {
        if (!input.NextToken)
          return jsonResponse({
            NextToken: 'second-setup-page',
            Regions: [{ Region: region, Index: { Status: 'SUCCEEDED' } }],
          });
        if (holdSecondSetupPage) {
          heldSignal = options?.abortSignal as AbortSignal;
          await new Promise<void>((_resolve, reject) => {
            heldSignal?.addEventListener('abort', () => reject(heldSignal?.reason), { once: true });
            if (heldSignal?.aborted) reject(heldSignal.reason);
          });
        }
        initialized = true;
        return jsonResponse({ Regions: [{ Region: region, View: { Status: 'SUCCEEDED' } }] });
      }
      if (operation === 'GetDefaultView') return jsonResponse({ ViewArn: viewArn });
      if (operation === 'GetView')
        return jsonResponse({ View: { ViewArn: viewArn, IncludedProperties: includedProperties } });
      if (operation === 'UpdateView') {
        includedProperties = input.IncludedProperties as { Name: string }[];
        return jsonResponse({ View: { ViewArn: viewArn, IncludedProperties: includedProperties } });
      }
    }
    unexpected.push(`${request.hostname} ${operation}`);
    throw new Error(`Unexpected synthetic setup request: ${request.hostname} ${operation}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(admissionDirectory, { force: true, recursive: true });
  expect(unexpected).toEqual([]);
});

it('initializes once, observes the created aggregator, and preserves the tagged default view on repeated setup', async () => {
  const destroyResourceExplorer = vi.spyOn(ResourceExplorer2Client.prototype, 'destroy');
  const destroyEC2 = vi.spyOn(EC2Client.prototype, 'destroy');
  const destroySTS = vi.spyOn(STSClient.prototype, 'destroy');
  const client = new CloudBurnClient();
  const options = { region, aws: { credentials }, timeoutMs: 10_000 };

  const created = await client.initializeDiscovery(options);
  expect(created).toMatchObject({
    status: 'CREATED',
    aggregatorAction: 'created',
    aggregatorRegion: region,
    createdIndexCount: 1,
    reusedIndexCount: 0,
    verificationStatus: 'verified',
    indexType: 'aggregator',
    regions: [region],
    taskId: 'synthetic-setup-task',
    observedStatus: {
      indexedRegionCount: 1,
      aggregatorRegion: region,
      regions: [{ region, status: 'indexed', viewStatus: 'present' }],
    },
  });
  expect(
    requests.filter(({ operation }) => operation === 'GetResourceExplorerSetup').map(({ input }) => input),
  ).toEqual([{ TaskId: 'synthetic-setup-task' }, { TaskId: 'synthetic-setup-task', NextToken: 'second-setup-page' }]);
  expect(includedProperties).toEqual([{ Name: 'custom-property' }, { Name: 'tags' }]);

  const existing = await client.initializeDiscovery(options);
  expect(existing).toMatchObject({
    status: 'EXISTING',
    aggregatorAction: 'unchanged',
    createdIndexCount: 0,
    reusedIndexCount: 1,
    verificationStatus: 'verified',
  });
  expect(
    requests.filter(({ operation }) =>
      ['CreateResourceExplorerSetup', 'UpdateIndexType', 'UpdateView'].includes(operation),
    ),
  ).toEqual([
    {
      operation: 'CreateResourceExplorerSetup',
      input: { AggregatorRegions: [region], RegionList: [region], ViewName: 'cloudburn-default' },
    },
    {
      operation: 'UpdateView',
      input: { IncludedProperties: [{ Name: 'custom-property' }, { Name: 'tags' }], ViewArn: viewArn },
    },
  ]);
  expect(destroyResourceExplorer).toHaveBeenCalledTimes(2);
  expect(destroyEC2).toHaveBeenCalledTimes(2);
  expect(destroySTS).toHaveBeenCalledTimes(2);
});

it('cancels the active setup result page before later polls, status observations, or view mutations', async () => {
  holdSecondSetupPage = true;
  const destroyResourceExplorer = vi.spyOn(ResourceExplorer2Client.prototype, 'destroy');
  const destroyEC2 = vi.spyOn(EC2Client.prototype, 'destroy');
  const destroySTS = vi.spyOn(STSClient.prototype, 'destroy');
  const controller = new AbortController();
  const reason = new Error('Stop setup verification');
  const result = new CloudBurnClient().initializeDiscovery({
    region,
    aws: { credentials },
    signal: controller.signal,
    timeoutMs: 10_000,
  });
  const rejected = expect(result).rejects.toBe(reason);
  try {
    await vi.waitFor(() => expect(heldSignal).toBeDefined());
    controller.abort(reason);
    await rejected;
    expect(heldSignal?.aborted).toBe(true);
    expect(initialized).toBe(false);
    expect(requests.filter(({ operation }) => operation === 'GetResourceExplorerSetup')).toHaveLength(2);
    expect(requests.filter(({ operation }) => operation === 'ListIndexes')).toHaveLength(2);
    expect(
      requests.filter(({ operation }) =>
        ['GetDefaultView', 'GetView', 'UpdateView', 'UpdateIndexType'].includes(operation),
      ),
    ).toEqual([]);
    expect(destroyResourceExplorer).toHaveBeenCalledOnce();
    expect(destroyEC2).toHaveBeenCalledOnce();
    expect(destroySTS).toHaveBeenCalledOnce();
  } finally {
    controller.abort(reason);
    await rejected;
  }
});
