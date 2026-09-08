import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EC2Client } from '@aws-sdk/client-ec2';
import { ResourceExplorer2Client } from '@aws-sdk/client-resource-explorer-2';
import { STSClient } from '@aws-sdk/client-sts';
import type { HttpRequest } from '@aws-sdk/types';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CloudBurnClient, withAwsClientCredentials } from '../src/index.js';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/aws-discovery/${name}`, import.meta.url), 'utf8');
const jsonResponse = (name: string) => ({
  response: { statusCode: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from(fixture(name)) },
});
let authorizations: string[];
let denyVolumes: boolean;
let denyIdentity: boolean;
let requests: Array<{ hostname: string; operation: string }>;
let unexpected: string[];
let debugMessages: string[];
let admissionDirectory: string;
let enabledRegions: string[] | undefined;
let holdOperation: string | undefined;
let failOperation: string | undefined;
let held: Array<{ region: string; signal: AbortSignal; release: () => void }>;

beforeEach(() => {
  authorizations = [];
  enabledRegions = undefined;
  holdOperation = undefined;
  failOperation = undefined;
  held = [];
  denyVolumes = false;
  denyIdentity = false;
  requests = [];
  unexpected = [];
  debugMessages = [];
  admissionDirectory = mkdtempSync(join(tmpdir(), 'cloudburn-discovery-http-'));
  vi.stubEnv('CLOUDBURN_AWS_ADMISSION_DIR', admissionDirectory);
  vi.stubEnv('CI', 'true');
  vi.stubEnv('AWS_REGION', 'eu-west-1');
  vi.stubEnv('AWS_ACCESS_KEY_ID', 'SYNTHETIC');
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'synthetic-test-key');
  vi.stubEnv('AWS_DEFAULT_REGION', '');
  vi.stubEnv('aws_region', '');
  vi.stubEnv('AWS_CONFIG_FILE', '/dev/null');
  vi.stubEnv('AWS_SHARED_CREDENTIALS_FILE', '/dev/null');
  const probe = new EC2Client({ region: 'eu-west-1' });
  const transport: typeof probe.config.requestHandler = Object.getPrototypeOf(probe.config.requestHandler);
  probe.destroy();
  vi.spyOn(transport, 'handle').mockImplementation(async (request: HttpRequest, options) => {
    authorizations.push(request.headers.authorization ?? '');
    const body = request.body ? String(request.body) : '';
    const operation = request.path === '/' ? (new URLSearchParams(body).get('Action') ?? '') : request.path.slice(1);
    requests.push({ hostname: request.hostname, operation });
    if (operation === failOperation) {
      return {
        response: {
          statusCode: 403,
          headers: { 'content-type': 'application/json', 'x-amzn-errortype': 'AccessDeniedException' },
          body: Buffer.from('{"message":"Synthetic denial"}'),
        },
      };
    }
    if (operation === holdOperation) {
      return new Promise((resolve, reject) => {
        const signal = options?.abortSignal as AbortSignal;
        const onAbort = () => reject(signal.reason);
        signal?.addEventListener('abort', onAbort, { once: true });
        held.push({
          region: request.hostname.split('.')[1] as string,
          signal,
          release: () => {
            signal?.removeEventListener('abort', onAbort);
            resolve({
              response: { statusCode: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from('{}') },
            });
          },
        });
      });
    }
    if (request.hostname === 'resource-explorer-2.eu-west-1.amazonaws.com') {
      if (operation === 'ListSupportedResourceTypes') {
        const input = body ? JSON.parse(body) : request.query;
        return {
          response: {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: Buffer.from(
              JSON.stringify(
                input.NextToken
                  ? { ResourceTypes: [{ ResourceType: 'ec2:volume', Service: 'ec2' }] }
                  : { ResourceTypes: [{ ResourceType: 's3:bucket', Service: 's3' }], NextToken: 'page-two' },
              ),
            ),
          },
        };
      }
      if (operation === 'ListIndexes') return jsonResponse('indexes.json');
      if (operation === 'GetDefaultView') return jsonResponse('default-view.json');
      if (operation === 'GetView') return jsonResponse('view.json');
      if (operation === 'ListResources') {
        const input = body ? JSON.parse(body) : request.query;
        return jsonResponse(input.NextToken ? 'resources-last.json' : 'resources-first.json');
      }
    }
    if (request.hostname === 'sts.eu-west-1.amazonaws.com' && operation === 'GetCallerIdentity') {
      return {
        response: {
          statusCode: denyIdentity ? 403 : 200,
          headers: { 'content-type': 'text/xml' },
          body: Buffer.from(
            denyIdentity
              ? '<ErrorResponse><Error><Code>AccessDenied</Code><Message>Synthetic identity failure</Message></Error><RequestId>synthetic-request</RequestId></ErrorResponse>'
              : fixture('caller-identity.xml'),
          ),
        },
      };
    }
    if (request.hostname === 'ec2.eu-west-1.amazonaws.com' && operation === 'DescribeRegions') {
      return {
        response: {
          statusCode: 200,
          headers: { 'content-type': 'text/xml' },
          body: Buffer.from(
            enabledRegions
              ? `<DescribeRegionsResponse><regionInfo>${enabledRegions.map((region) => `<item><regionName>${region}</regionName></item>`).join('')}</regionInfo></DescribeRegionsResponse>`
              : fixture('regions.xml'),
          ),
        },
      };
    }
    if (request.hostname === 'ec2.eu-west-1.amazonaws.com' && operation === 'DescribeVolumes') {
      return {
        response: {
          statusCode: denyVolumes ? 403 : 200,
          headers: { 'content-type': 'text/xml' },
          body: Buffer.from(
            denyVolumes
              ? '<Response><Errors><Error><Code>UnauthorizedOperation</Code><Message>Denied by the synthetic policy</Message></Error></Errors><RequestID>synthetic-request</RequestID></Response>'
              : fixture('volumes.xml'),
          ),
        },
      };
    }
    const description = `${request.method} ${request.hostname}${request.path}`;
    unexpected.push(description);
    throw new Error(`Unexpected offline AWS request: ${description}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(admissionDirectory, { recursive: true, force: true });
  expect(unexpected).toEqual([]);
});

const discover = () =>
  new CloudBurnClient({ debugLogger: (message) => debugMessages.push(message) }).discover({
    target: { mode: 'regions', regions: ['eu-west-1'] },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1'] } },
    aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
    includeEvaluationResources: true,
  });

const volumeAttempt = () =>
  debugMessages
    .filter((message) => message.startsWith('aws: attempt '))
    .map((message) => JSON.parse(message.slice(13)))
    .find((attempt) => attempt.operation === 'DescribeVolumes');

it('discovers through real AWS serialization, catalog pagination, hydration and rule evaluation', async () => {
  const result = await discover();
  expect(result.providers[0]?.rules[0]?.findings).toEqual([
    { accountId: '111111111111', region: 'eu-west-1', resourceId: 'vol-legacy', resourceType: 'ec2:volume' },
  ]);
  expect(result.evaluations?.resourceSets[0]?.resources.map((resource) => resource.resourceId).sort()).toEqual([
    'vol-current',
    'vol-legacy',
  ]);
  expect(result.diagnostics).toBeUndefined();
  expect(requests.filter((request) => request.operation === 'ListResources')).toHaveLength(2);
  expect(requests.filter((request) => request.operation === 'DescribeVolumes')).toHaveLength(1);
  expect(requests.filter((request) => request.operation === 'GetCallerIdentity')).toHaveLength(1);
  // Findings retain their resource account; quotas use the signing caller's account.
  expect(volumeAttempt()).toMatchObject({ quota: { accountId: '222222222222' } });
});

it('retains discovery results with per-run quotas when the caller identity lookup fails', async () => {
  denyIdentity = true;
  const result = await discover();

  expect(result.providers[0]?.rules[0]?.findings).toEqual([
    { accountId: '111111111111', region: 'eu-west-1', resourceId: 'vol-legacy', resourceType: 'ec2:volume' },
  ]);
  expect(requests.filter((request) => request.operation === 'GetCallerIdentity')).toHaveLength(1);
  expect(volumeAttempt()).toMatchObject({ quota: { accountId: expect.stringMatching(/^unresolved:/) } });
});

it('reports denied required AWS evidence as unavailable rather than a passed check', async () => {
  denyVolumes = true;
  const result = await discover();
  expect(result.providers).toEqual([]);
  expect(result.evaluations?.rules).toEqual([
    expect.objectContaining({ ruleId: 'CLDBRN-AWS-EBS-1', status: 'not_applicable' }),
  ]);
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: 'UnauthorizedOperation' })]),
  );
});

it('owns supported-type clients across pagination and disposes them after success', async () => {
  const destroy = vi.spyOn(ResourceExplorer2Client.prototype, 'destroy');
  const result = await new CloudBurnClient().listSupportedDiscoveryResourceTypes();
  expect(result.map((type) => type.resourceType)).toEqual(['ec2:volume', 's3:bucket']);
  expect(requests.filter((request) => request.operation === 'ListSupportedResourceTypes')).toHaveLength(2);
  expect(destroy).toHaveBeenCalledOnce();
});

it('admits catalog and control-plane requests using the signing account before hydration', async () => {
  await discover();
  const attempts = debugMessages
    .filter((message) => message.startsWith('aws: attempt '))
    .map((message) => JSON.parse(message.slice(13)));
  for (const operation of [
    'DescribeRegions',
    'ListIndexes',
    'GetDefaultView',
    'GetView',
    'ListResources',
    'DescribeVolumes',
  ]) {
    expect(attempts).toContainEqual(
      expect.objectContaining({ operation, quota: expect.objectContaining({ accountId: '222222222222' }) }),
    );
  }
  expect(
    new Set(
      attempts
        .filter((attempt) => attempt.operation !== 'GetCallerIdentity')
        .map((attempt) => attempt.attribution.scanId),
    ).size,
  ).toBe(1);
});

it('bounds status workers to five and preserves deterministic region ordering', async () => {
  enabledRegions = [
    'us-west-2',
    'us-west-1',
    'eu-west-3',
    'eu-west-2',
    'eu-west-1',
    'eu-central-1',
    'ap-south-1',
    'us-east-1',
  ];
  holdOperation = 'ListIndexes';
  const controller = new AbortController();
  const run = new CloudBurnClient().getDiscoveryStatus({ region: 'eu-west-1', signal: controller.signal });
  const settled = run.catch(() => undefined);
  try {
    await vi.waitFor(() => expect(held.length).toBeGreaterThanOrEqual(5));
    expect(held).toHaveLength(5);
    held[3]?.release();
    await vi.waitFor(() => expect(held).toHaveLength(6));
    held[0]?.release();
    held[2]?.release();
    await vi.waitFor(() => expect(held).toHaveLength(8));
    for (const request of held) request.release();
    const result = await run;
    expect(result.regions.map((region) => region.region)).toEqual([...enabledRegions].sort());
    expect(result.regions.every((region) => region.status === 'not_indexed')).toBe(true);
  } finally {
    controller.abort();
    await settled;
  }
});

type Operation = 'discovery' | 'status' | 'setup' | 'supported types';
const invokeOperation = (operation: Operation, options: { signal?: AbortSignal; timeoutMs?: number } = {}) => {
  const client = new CloudBurnClient();
  const execution = {
    ...options,
    aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
  };
  if (operation === 'discovery')
    return client.discover({
      ...execution,
      target: { mode: 'regions', regions: ['eu-west-1'] },
      config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1'] } },
    });
  if (operation === 'status') return client.getDiscoveryStatus({ ...execution, region: 'eu-west-1' });
  if (operation === 'setup') return client.initializeDiscovery({ ...execution, region: 'eu-west-1' });
  return client.listSupportedDiscoveryResourceTypes(execution);
};
const operations: Operation[] = ['discovery', 'status', 'setup', 'supported types'];

it.each(operations)('cancels active %s HTTP work and disposes clients without later dispatch', async (operation) => {
  holdOperation = operation === 'supported types' ? 'ListSupportedResourceTypes' : 'ListIndexes';
  const destroy = vi.spyOn(ResourceExplorer2Client.prototype, 'destroy');
  const destroyIdentity = vi.spyOn(STSClient.prototype, 'destroy');
  const controller = new AbortController();
  const reason = new Error('caller stopped discovery');
  const run = invokeOperation(operation, { signal: controller.signal });
  const assertion = expect(run).rejects.toBe(reason);
  await vi.waitFor(() => expect(held).toHaveLength(1));
  const requestCount = requests.length;
  controller.abort(reason);
  await assertion;
  expect(held[0]?.signal.aborted).toBe(true);
  expect(destroy).toHaveBeenCalledOnce();
  expect(destroyIdentity).toHaveBeenCalledOnce();
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(requests).toHaveLength(requestCount);
});

it.each(operations)('enforces the total %s deadline and aborts active HTTP work', async (operation) => {
  holdOperation = 'GetCallerIdentity';
  const destroy = vi.spyOn(STSClient.prototype, 'destroy');
  await expect(invokeOperation(operation, { timeoutMs: 100 })).rejects.toMatchObject({ name: 'TimeoutError' });
  expect(held).toHaveLength(1);
  expect(held[0]?.signal.aborted).toBe(true);
  expect(destroy).toHaveBeenCalledOnce();
});

it.each(operations)('rejects pre-cancelled %s without creating clients or sending requests', async (operation) => {
  const controller = new AbortController();
  controller.abort();
  await expect(invokeOperation(operation, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(requests).toEqual([]);
});

it.each(operations)('disposes owned clients when %s fails', async (operation) => {
  failOperation = operation === 'supported types' ? 'ListSupportedResourceTypes' : 'DescribeRegions';
  const destroyIdentity = vi.spyOn(STSClient.prototype, 'destroy');
  const destroy = vi.spyOn(
    operation === 'supported types' ? ResourceExplorer2Client.prototype : EC2Client.prototype,
    'destroy',
  );
  await expect(invokeOperation(operation)).rejects.toBeInstanceOf(Error);
  expect(destroyIdentity).toHaveBeenCalledOnce();
  expect(destroy).toHaveBeenCalledOnce();
});

it('cancels regional status without starting queued regions', async () => {
  enabledRegions = [
    'us-west-2',
    'us-west-1',
    'eu-west-3',
    'eu-west-2',
    'eu-west-1',
    'eu-central-1',
    'ap-south-1',
    'us-east-1',
  ];
  holdOperation = 'ListIndexes';
  const controller = new AbortController();
  const assertion = expect(invokeOperation('status', { signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError',
  });
  await vi.waitFor(() => expect(held).toHaveLength(5));
  controller.abort();
  await assertion;
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(held).toHaveLength(5);
  expect(held.every((request) => request.signal.aborted)).toBe(true);
});

it('preserves credentials supplied through the existing public credential scope', async () => {
  await withAwsClientCredentials({ accessKeyId: 'SCOPED', secretAccessKey: 'synthetic-scoped-key' }, () =>
    new CloudBurnClient().listSupportedDiscoveryResourceTypes(),
  );
  expect(authorizations.length).toBeGreaterThan(0);
  expect(authorizations.every((header) => header.includes('Credential=SCOPED/'))).toBe(true);
});
