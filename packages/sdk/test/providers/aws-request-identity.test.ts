import { afterEach, expect, it, vi } from 'vitest';
import { withAwsDiscoveryExecution } from '../../src/providers/aws/execution.js';
import {
  type AwsRequestAttemptTelemetry,
  runAwsRequest,
  withAwsServiceCallBudget,
} from '../../src/providers/aws/request.js';
import { createMemoryAwsRequestStore } from '../../src/providers/aws/request-store.js';

const overrides = { 'logs:DescribeLogStreams': { ratePerSecond: 1, burst: 1 } };
const request = (execute: () => Promise<unknown>) =>
  runAwsRequest('Amazon CloudWatch Logs', 'DescribeLogStreams', 'eu-west-1', execute);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it('shares caller quotas across scans with different catalog account hints', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const store = createMemoryAwsRequestStore();
  const starts: number[] = [];
  const events: AwsRequestAttemptTelemetry[] = [];
  const resolvers = [vi.fn(async () => '333333333333'), vi.fn(async () => '333333333333')];
  const scans = ['111111111111', '222222222222'].map((accountId, index) =>
    withAwsServiceCallBudget(
      () => Promise.all(Array.from({ length: 2 }, () => request(async () => starts.push(Date.now())))),
      { accountId, resolveAccountId: resolvers[index], store, overrides, onAttempt: (event) => events.push(event) },
    ),
  );

  await vi.advanceTimersByTimeAsync(3_000);
  await Promise.all(scans);
  expect(starts).toEqual([0, 1_000, 2_000, 3_000]);
  expect(events.map((event) => event.quota?.accountId)).toEqual(Array(4).fill('333333333333'));
  for (const resolver of resolvers) expect(resolver).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps distinct callers independent when their catalog account hint is the same', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const store = createMemoryAwsRequestStore();
  const starts: number[] = [];
  const events: AwsRequestAttemptTelemetry[] = [];
  const scans = ['222222222222', '333333333333'].map((callerAccount) =>
    withAwsServiceCallBudget(() => request(async () => starts.push(Date.now())), {
      accountId: '111111111111',
      resolveAccountId: async () => callerAccount,
      store,
      overrides,
      onAttempt: (event) => events.push(event),
    }),
  );

  await vi.advanceTimersByTimeAsync(1_000);
  await Promise.all(scans);
  expect(starts).toEqual([0, 0]);
  expect(events.map((event) => event.quota?.accountId).sort()).toEqual(['222222222222', '333333333333']);
  expect(vi.getTimerCount()).toBe(0);
});

it('continues with isolated per-run admission when caller identity cannot be resolved', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.stubEnv('CLOUDBURN_AWS_ADMISSION_DIR', '/dev/null/unwritable');
  const starts: number[][] = [[], []];
  const events: AwsRequestAttemptTelemetry[][] = [[], []];
  const resolvers = [0, 1].map(() => vi.fn(async () => Promise.reject(new Error('Synthetic STS unavailable'))));
  const scans = resolvers.map((resolveAccountId, index) =>
    withAwsServiceCallBudget(
      () => Promise.all(Array.from({ length: 2 }, () => request(async () => starts[index]?.push(Date.now())))),
      { resolveAccountId, overrides, onAttempt: (event) => events[index]?.push(event) },
    ),
  );
  const outcomes = Promise.allSettled(scans);

  await vi.advanceTimersByTimeAsync(1_000);
  expect((await outcomes).map((outcome) => outcome.status)).toEqual(['fulfilled', 'fulfilled']);
  expect(starts).toEqual([
    [0, 1_000],
    [0, 1_000],
  ]);
  const accounts = events.map((scan) => scan.map((event) => event.quota?.accountId));
  expect(accounts[0]?.[0]).toMatch(/^unresolved:/);
  expect(accounts[1]?.[0]).toMatch(/^unresolved:/);
  expect(accounts[0]?.[0]).not.toBe(accounts[1]?.[0]);
  expect(accounts[0]?.[0]).toBe(accounts[0]?.[1]);
  expect(accounts[1]?.[0]).toBe(accounts[1]?.[1]);
  for (const resolver of resolvers) expect(resolver).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('cancels identity resolution without dispatching a fallback request', async () => {
  const controller = new AbortController();
  const identity = Promise.withResolvers<string>();
  const resolving = Promise.withResolvers<void>();
  void identity.promise.catch(() => undefined);
  const resolveAccountId = vi.fn(() => {
    resolving.resolve();
    return identity.promise;
  });
  const execute = vi.fn(async () => 'response');
  const reason = new DOMException('Cancelled identity lookup', 'AbortError');
  const scan = withAwsDiscoveryExecution({ signal: controller.signal }, () =>
    withAwsServiceCallBudget(() => request(execute), {
      accountId: '111111111111',
      resolveAccountId,
      store: createMemoryAwsRequestStore(),
    }),
  );
  const outcome = scan.catch((error) => error);

  await resolving.promise;
  controller.abort(reason);
  identity.reject(new Error('Late identity failure'));
  expect(await outcome).toBe(reason);
  expect(resolveAccountId).toHaveBeenCalledOnce();
  expect(execute).not.toHaveBeenCalled();
});
