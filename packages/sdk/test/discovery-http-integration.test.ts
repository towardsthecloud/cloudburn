import { join } from 'node:path';
import { EC2Client } from '@aws-sdk/client-ec2';
import { ResourceExplorer2Client } from '@aws-sdk/client-resource-explorer-2';
import { STSClient } from '@aws-sdk/client-sts';
import { expect, it, vi } from 'vitest';
import { type AwsDiscoveryProgressEvent, CloudBurnClient, withAwsClientCredentials } from '../src/index.js';
import {
  accountId,
  admissionDirectory,
  authorizations,
  debugMessages,
  discover,
  held,
  type RegionsCacheDiscoverOptions,
  region,
  requests,
  scenario,
  useDiscoveryHttpHarness,
  volumeAttempt,
  waitForCancelledCatalogCleanup,
} from './helpers/discovery-http.js';

useDiscoveryHttpHarness();

it('discovers through real AWS serialization, catalog pagination, hydration and rule evaluation', async () => {
  const result = await discover();
  expect(result.providers[0]?.rules[0]?.findings).toEqual([
    {
      accountId: '111111111111',
      actionType: 'Upgrade',
      recommendation: {
        opportunityId: '["opportunity",1,"aws","111111111111","eu-west-1","ec2:volume","vol-legacy","Upgrade"]',
        resourceKey: '["resource",1,"aws","111111111111","eu-west-1","ec2:volume","vol-legacy"]',
        source: 'cloudburn',
      },
      region: 'eu-west-1',
      resourceId: 'vol-legacy',
      resourceType: 'ec2:volume',
    },
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
  expect(volumeAttempt()).toMatchObject({
    quota: { accountId: '222222222222' },
    attribution: { dataset: 'aws-ebs-volumes', datasets: ['aws-ebs-volumes'] },
  });
});

it('collects independent account evidence while catalog pagination is blocked', async () => {
  scenario.holdOperation = 'ListResources';
  const controller = new AbortController();
  const scan = new CloudBurnClient({ debugLogger: (message) => debugMessages.push(message) }).discover({
    signal: controller.signal,
    aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
    target: { mode: 'region', region },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1', 'CLDBRN-AWS-COSTGUARDRAILS-2'] } },
  });
  const outcome = scan.catch((error: unknown) => error);
  try {
    await vi.waitFor(() => expect(held.length).toBeGreaterThan(0), { timeout: 4000 });
    await vi.waitFor(() => expect(requests.some(({ operation }) => operation === 'GetAnomalyMonitors')).toBe(true));
  } finally {
    controller.abort();
    await outcome;
    await waitForCancelledCatalogCleanup();
  }
});

it('reports provisional evaluated findings before unrelated hydration completes', async () => {
  scenario.holdOperation = 'DescribeVolumes';
  const events: AwsDiscoveryProgressEvent[] = [];
  const controller = new AbortController();
  const scan = new CloudBurnClient({ debugLogger: (message) => debugMessages.push(message) }).discover({
    signal: controller.signal,
    aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
    target: { mode: 'region', region },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1', 'CLDBRN-AWS-COSTGUARDRAILS-2'] } },
    includeEvaluationResources: true,
    onProgress: (event) => events.push(event),
  });
  const outcome = scan.catch((error: unknown) => error);
  try {
    await vi.waitFor(() => expect(held.length).toBeGreaterThan(0), { timeout: 4000 });
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: 'rule',
        ruleId: 'CLDBRN-AWS-COSTGUARDRAILS-2',
        provisional: true,
        status: 'triggered',
        findingCount: 1,
      }),
    );
    expect(events.filter((event) => event.kind === 'rule')).toHaveLength(1);
    held[0]?.release();
    const result = await scan;
    expect(result.providers.flatMap((provider) => provider.rules).map((rule) => rule.ruleId)).toEqual([
      'CLDBRN-AWS-COSTGUARDRAILS-2',
      'CLDBRN-AWS-EBS-1',
    ]);
    expect(events.filter((event) => event.kind === 'rule')).toHaveLength(2);
    const timingLog = debugMessages.find((message) => message.startsWith('sdk: live scan timing '));
    expect(timingLog).toBeDefined();
    const timing = JSON.parse(timingLog?.slice('sdk: live scan timing '.length) ?? '{}');
    expect(timing.firstRuleMs).toBe(events.find((event) => event.kind === 'rule')?.elapsedMs);
    expect(timing.totalMs).toBeGreaterThan(timing.firstRuleMs);
  } finally {
    controller.abort();
    await outcome;
  }
});

it('evaluates a cached catalog scope while an unrelated catalog miss is blocked', async () => {
  const client = new CloudBurnClient({ debugLogger: (message) => debugMessages.push(message) });
  const cache = { directory: join(admissionDirectory, 'evidence'), authorizationContext: 'synthetic-policy-v1' };
  const aws = { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } };
  await client.discover({
    cache,
    aws,
    target: { mode: 'region', region },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1'] } },
  });
  scenario.holdOperation = 'ListResources';
  const controller = new AbortController();
  const events: AwsDiscoveryProgressEvent[] = [];
  const scan = client.discover({
    cache,
    aws,
    signal: controller.signal,
    target: { mode: 'region', region },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1', 'CLDBRN-AWS-CLOUDWATCH-1'] } },
    onProgress: (event) => events.push(event),
  });
  const outcome = scan.catch((error: unknown) => error);
  try {
    await vi.waitFor(() => expect(held.length).toBeGreaterThan(0), { timeout: 4000 });
    await vi.waitFor(() =>
      expect(events).toContainEqual(
        expect.objectContaining({
          kind: 'rule',
          ruleId: 'CLDBRN-AWS-EBS-1',
          status: 'triggered',
          findingCount: 1,
        }),
      ),
    );
    expect(events.some((event) => event.kind === 'catalog')).toBe(false);
  } finally {
    controller.abort();
    await outcome;
    await waitForCancelledCatalogCleanup();
  }
});

it('never evaluates absence from an empty catalog page with more pages pending', async () => {
  scenario.holdOperation = 'ListResources';
  scenario.holdLastCatalogPage = true;
  const events: AwsDiscoveryProgressEvent[] = [];
  const controller = new AbortController();
  const scan = new CloudBurnClient().discover({
    signal: controller.signal,
    aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
    target: { mode: 'region', region },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1'] } },
    onProgress: (event) => events.push(event),
  });
  const outcome = scan.catch((error: unknown) => error);
  try {
    await vi.waitFor(() => expect(held).toHaveLength(1), { timeout: 4000 });
    expect(events).toEqual([]);
    expect(requests.some(({ operation }) => operation === 'DescribeVolumes')).toBe(false);
    held[0]?.release();
    const result = await scan;
    expect(result.providers[0]?.rules[0]?.findings).toEqual([
      {
        accountId,
        actionType: 'Upgrade',
        recommendation: {
          opportunityId: '["opportunity",1,"aws","111111111111","eu-west-1","ec2:volume","vol-legacy","Upgrade"]',
          resourceKey: '["resource",1,"aws","111111111111","eu-west-1","ec2:volume","vol-legacy"]',
          source: 'cloudburn',
        },
        region,
        resourceId: 'vol-legacy',
        resourceType: 'ec2:volume',
      },
    ]);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'rule', status: 'triggered', findingCount: 1 }));
  } finally {
    controller.abort();
    await outcome;
  }
});

it('rejects cancellation after useful progress and stops active transport and later events', async () => {
  scenario.holdOperation = 'DescribeVolumes';
  const controller = new AbortController();
  const events: AwsDiscoveryProgressEvent[] = [];
  const scan = new CloudBurnClient().discover({
    signal: controller.signal,
    aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
    target: { mode: 'region', region },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1', 'CLDBRN-AWS-COSTGUARDRAILS-2'] } },
    onProgress: (event) => events.push(event),
  });
  const outcome = scan.catch((error: unknown) => error);
  try {
    await vi.waitFor(() => expect(held).toHaveLength(1), { timeout: 4000 });
    expect(events.some((event) => event.kind === 'rule')).toBe(true);
    const eventCount = events.length;
    const requestCount = requests.length;
    controller.abort();
    expect(await outcome).toMatchObject({ name: 'AbortError' });
    expect(held[0]?.signal.aborted).toBe(true);
    held[0]?.release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(events).toHaveLength(eventCount);
    expect(requests).toHaveLength(requestCount);
  } finally {
    controller.abort();
    await outcome;
  }
});

it('reuses complete evidence across scans while re-evaluating rule selection', async () => {
  const client = new CloudBurnClient();
  const options: RegionsCacheDiscoverOptions = {
    target: { mode: 'regions', regions: ['eu-west-1'] },
    cache: { directory: join(admissionDirectory, 'evidence'), authorizationContext: 'synthetic-policy-v1' },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1'] } },
    includeEvaluationResources: true,
  };
  const first = await client.discover(options);
  const second = await client.discover({
    ...options,
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-2'] } },
  });
  expect(first.providers[0]?.rules[0]?.ruleId).toBe('CLDBRN-AWS-EBS-1');
  expect(second.evaluations?.rules[0]?.ruleId).toBe('CLDBRN-AWS-EBS-2');
  expect(requests.filter(({ operation }) => operation === 'DescribeVolumes')).toHaveLength(1);
  expect(requests.filter(({ operation }) => operation === 'ListResources')).toHaveLength(2);
  expect(second.evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ datasetKey: 'aws-ebs-volumes', source: 'cache', complete: true }),
    ]),
  );
});

it('retains discovery results with per-run quotas when the caller identity lookup fails', async () => {
  scenario.denyIdentity = true;
  const result = await discover();

  expect(result.providers[0]?.rules[0]?.findings).toEqual([
    {
      accountId: '111111111111',
      actionType: 'Upgrade',
      recommendation: {
        opportunityId: '["opportunity",1,"aws","111111111111","eu-west-1","ec2:volume","vol-legacy","Upgrade"]',
        resourceKey: '["resource",1,"aws","111111111111","eu-west-1","ec2:volume","vol-legacy"]',
        source: 'cloudburn',
      },
      region: 'eu-west-1',
      resourceId: 'vol-legacy',
      resourceType: 'ec2:volume',
    },
  ]);
  expect(requests.filter((request) => request.operation === 'GetCallerIdentity')).toHaveLength(1);
  expect(volumeAttempt()).toMatchObject({ quota: { accountId: expect.stringMatching(/^unresolved:/) } });
});

it('reports denied required AWS evidence as unavailable rather than a passed check', async () => {
  scenario.denyVolumes = true;
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
  scenario.enabledRegions = [
    'us-west-2',
    'us-west-1',
    'eu-west-3',
    'eu-west-2',
    'eu-west-1',
    'eu-central-1',
    'ap-south-1',
    'us-east-1',
  ];
  scenario.holdOperation = 'ListIndexes';
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
    expect(result.regions.map((region) => region.region)).toEqual([...scenario.enabledRegions].sort());
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
  scenario.holdOperation = operation === 'supported types' ? 'ListSupportedResourceTypes' : 'ListIndexes';
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
  scenario.holdOperation = 'GetCallerIdentity';
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
  scenario.failOperation = operation === 'supported types' ? 'ListSupportedResourceTypes' : 'DescribeRegions';
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
  scenario.enabledRegions = [
    'us-west-2',
    'us-west-1',
    'eu-west-3',
    'eu-west-2',
    'eu-west-1',
    'eu-central-1',
    'ap-south-1',
    'us-east-1',
  ];
  scenario.holdOperation = 'ListIndexes';
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

it.each([
  ['ListIndexes', 500],
  ['GetDefaultView', 500],
  ['GetView', 500],
  ['ListIndexes', 429],
  ['GetDefaultView', 429],
  ['GetView', 429],
] as const)('bounds status probe %s to two physical attempts after HTTP %i', async (operation, statusCode) => {
  vi.useFakeTimers();
  // Failed identity uses the existing in-memory fallback, making admission clock-driven.
  scenario.denyIdentity = true;
  scenario.transientOperation = operation;
  scenario.transientStatusCode = statusCode;
  const result = new CloudBurnClient({ debugLogger: (message) => debugMessages.push(message) }).getDiscoveryStatus();
  await vi.waitFor(() => expect(requests.some((request) => request.operation === operation)).toBe(true));
  await vi.advanceTimersByTimeAsync(120_000);
  const status = await result;
  expect(status.regions).toEqual([
    expect.objectContaining(
      operation === 'ListIndexes'
        ? { region: 'eu-west-1', status: 'error' }
        : { region: 'eu-west-1', status: 'indexed', viewStatus: 'error' },
    ),
  ]);
  expect(requests.filter((request) => request.operation === operation)).toHaveLength(2);
  const attempts = debugMessages
    .filter((message) => message.startsWith('aws: attempt '))
    .map((message) => JSON.parse(message.slice(13)))
    .filter((attempt) => attempt.operation === operation);
  expect(attempts.map((attempt) => attempt.retryOutcome)).toEqual(['scheduled', 'exhausted']);
  expect(attempts.every((attempt) => attempt.quota?.group === 'non-search')).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['ListIndexes', 'GetDefaultView', 'GetView'])(
  'recovers status probe %s on its second attempt',
  async (operation) => {
    vi.useFakeTimers();
    scenario.denyIdentity = true;
    scenario.transientOperation = operation;
    scenario.transientFailures = 1;
    const result = new CloudBurnClient().getDiscoveryStatus();
    await vi.waitFor(() => expect(requests.some((request) => request.operation === operation)).toBe(true));
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await result).regions).toEqual([
      expect.objectContaining({ region: 'eu-west-1', status: 'indexed', viewStatus: 'present' }),
    ]);
    expect(requests.filter((request) => request.operation === operation)).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  },
);
