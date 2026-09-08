import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it, vi } from 'vitest';
import { withAwsDiscoveryExecution } from '../../src/providers/aws/execution.js';
import { runAwsRequest, withAwsServiceCallBudget } from '../../src/providers/aws/request.js';
import { createLocalAwsRequestStore, createMemoryAwsRequestStore } from '../../src/providers/aws/request-store.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('recovers completed leases after cleanup fails without waiting for the scan deadline', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const store = createMemoryAwsRequestStore();
  const update = store.update;
  let blocked = false;
  vi.spyOn(store, 'update').mockImplementation((...args) => {
    if (blocked) return Promise.reject(new Error('Synthetic cleanup contention'));
    return update(...args);
  });
  const firstStarted = vi.fn();
  const completed = Promise.withResolvers<void>();
  const onAttempt = vi.fn();
  const options = {
    accountId: 'completed-lease-recovery',
    store,
    onAttempt,
    overrides: { 'logs:DescribeLogStreams': { concurrency: 10, ratePerSecond: 100, burst: 100 } },
  };
  const first = withAwsServiceCallBudget(
    () =>
      Promise.all(
        Array.from({ length: 10 }, () =>
          runAwsRequest('CloudWatch Logs', 'DescribeLogStreams', 'eu-west-1', async () => {
            firstStarted();
            await completed.promise;
            return 'first response';
          }),
        ),
      ),
    options,
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(firstStarted).toHaveBeenCalledTimes(10);
  blocked = true;
  completed.resolve();
  await expect(first).resolves.toHaveLength(10);
  expect(onAttempt.mock.calls.every(([event]) => event.cleanupOutcome === 'deferred')).toBe(true);
  blocked = false;

  const controller = new AbortController();
  const followingStarted = vi.fn(async () => 'following response');
  const following = withAwsDiscoveryExecution({ signal: controller.signal }, () =>
    withAwsServiceCallBudget(
      () =>
        Promise.all(
          Array.from({ length: 20 }, () =>
            runAwsRequest('CloudWatch Logs', 'DescribeLogStreams', 'eu-west-1', followingStarted),
          ),
        ),
      options,
    ),
  );
  const followingOutcome = following.catch(() => undefined);
  try {
    await vi.advanceTimersByTimeAsync(1_000);
    expect(followingStarted).toHaveBeenCalledTimes(20);
    await expect(following).resolves.toHaveLength(20);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    controller.abort();
    await followingOutcome;
  }
});

it('keeps a cancelled attempt leased until its underlying work settles', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const store = createMemoryAwsRequestStore();
  const controller = new AbortController();
  const started = Promise.withResolvers<void>();
  const completed = Promise.withResolvers<void>();
  const onAttempt = vi.fn();
  const options = {
    accountId: 'cancelled-physical-attempt',
    store,
    onAttempt,
    overrides: { 'logs:DescribeLogStreams': { concurrency: 1, ratePerSecond: 100, burst: 100 } },
  };
  let requestOutcome: Promise<unknown> | undefined;
  const first = withAwsDiscoveryExecution({ signal: controller.signal, timeoutMs: 5_000 }, () =>
    withAwsServiceCallBudget(() => {
      const request = runAwsRequest('CloudWatch Logs', 'DescribeLogStreams', 'eu-west-1', async () => {
        started.resolve();
        await completed.promise;
        return 'late first response';
      });
      requestOutcome = request.catch((error) => error);
      return request;
    }, options),
  );
  const firstOutcome = first.catch((error) => error);
  await started.promise;
  controller.abort(new Error('Stop the first scan'));
  await vi.advanceTimersByTimeAsync(100);
  expect(await firstOutcome).toMatchObject({ message: 'Stop the first scan' });
  expect(await requestOutcome).toMatchObject({ message: 'Stop the first scan' });
  expect(onAttempt).toHaveBeenCalledWith(expect.objectContaining({ cleanupOutcome: 'deferred' }));

  const followingStarted = vi.fn(async () => 'following response');
  const following = withAwsServiceCallBudget(
    () => runAwsRequest('CloudWatch Logs', 'DescribeLogStreams', 'eu-west-1', followingStarted),
    options,
  );
  try {
    await vi.advanceTimersByTimeAsync(500);
    expect(followingStarted).not.toHaveBeenCalled();
    completed.resolve();
    await vi.advanceTimersByTimeAsync(10);
    await expect(following).resolves.toBe('following response');
    expect(followingStarted).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    completed.resolve();
    await vi.advanceTimersByTimeAsync(10);
    await following;
  }
});

it('stops completed-lease cleanup retries at the original lease deadline', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const store = createMemoryAwsRequestStore();
  const update = store.update;
  let blocked = false;
  const updates = vi.spyOn(store, 'update').mockImplementation((...args) => {
    if (blocked) return Promise.reject(new Error('Storage remains unavailable'));
    return update(...args);
  });
  await expect(
    withAwsDiscoveryExecution({ timeoutMs: 500 }, () =>
      withAwsServiceCallBudget(
        () =>
          runAwsRequest('CloudWatch Logs', 'DescribeLogStreams', 'eu-west-1', async () => {
            blocked = true;
            return 'preserved response';
          }),
        { accountId: 'cleanup-deadline', store },
      ),
    ),
  ).resolves.toBe('preserved response');
  await vi.advanceTimersByTimeAsync(500);
  expect(vi.getTimerCount()).toBe(0);
  const attemptsAtDeadline = updates.mock.calls.length;
  await vi.advanceTimersByTimeAsync(1_000);
  expect(updates).toHaveBeenCalledTimes(attemptsAtDeadline);
});

it('limits admission probes while more than ten callers wait on the same local quota', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const store = createMemoryAwsRequestStore();
  const updates = vi.spyOn(store, 'update');
  const saturated = Promise.withResolvers<void>();
  const completed = Promise.withResolvers<void>();
  const controller = new AbortController();
  let active = 0;
  let peak = 0;
  let starts = 0;
  const requests = withAwsDiscoveryExecution({ signal: controller.signal }, () =>
    withAwsServiceCallBudget(
      () =>
        Promise.all(
          Array.from({ length: 30 }, () =>
            runAwsRequest('CloudWatch Logs', 'DescribeLogStreams', 'eu-west-1', async () => {
              active += 1;
              peak = Math.max(peak, active);
              starts += 1;
              if (active === 10) saturated.resolve();
              await completed.promise;
              active -= 1;
            }),
          ),
        ),
      {
        accountId: 'admission-probe-contention',
        store,
        overrides: { 'logs:DescribeLogStreams': { concurrency: 10, ratePerSecond: 100, burst: 100 } },
      },
    ),
  );
  const outcome = requests.catch(() => undefined);
  try {
    await saturated.promise;
    await vi.advanceTimersByTimeAsync(100);
    expect(starts).toBe(10);
    expect(updates.mock.calls.length).toBeLessThanOrEqual(25);
    completed.resolve();
    await vi.advanceTimersByTimeAsync(100);
    await requests;
    expect(starts).toBe(30);
    expect(peak).toBe(10);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    completed.resolve();
    controller.abort();
    await outcome;
  }
});

it('does not commit SQLite state while callers wait on a saturated concurrency quota', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const directory = mkdtempSync(join(tmpdir(), 'cloudburn-refused-admission-'));
  const store = createLocalAwsRequestStore(directory);
  const saturated = Promise.withResolvers<void>();
  const completed = Promise.withResolvers<void>();
  const controller = new AbortController();
  let started = 0;
  const requests = withAwsDiscoveryExecution({ signal: controller.signal }, () =>
    withAwsServiceCallBudget(
      () =>
        Promise.all(
          Array.from({ length: 30 }, () =>
            runAwsRequest('CloudWatch Logs', 'DescribeLogStreams', 'eu-west-1', async () => {
              started += 1;
              if (started === 10) saturated.resolve();
              await completed.promise;
            }),
          ),
        ),
      {
        accountId: 'sqlite-refused-admission',
        store,
        overrides: { 'logs:DescribeLogStreams': { concurrency: 10, ratePerSecond: 100, burst: 100 } },
      },
    ),
  );
  const outcome = requests.catch(() => undefined);
  let observer: DatabaseSync | undefined;
  try {
    await saturated.promise;
    const filename = readdirSync(directory).find((name) => name.endsWith('.sqlite'));
    expect(filename).toBeDefined();
    observer = new DatabaseSync(join(directory, filename as string));
    const before = observer.prepare('PRAGMA data_version').get()?.data_version;
    await vi.advanceTimersByTimeAsync(100);
    expect(started).toBe(10);
    expect(observer.prepare('PRAGMA data_version').get()?.data_version).toBe(before);
    completed.resolve();
    await vi.advanceTimersByTimeAsync(100);
    await requests;
    expect(started).toBe(30);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    completed.resolve();
    controller.abort();
    await outcome;
    observer?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('expires a queued caller at its own budget deadline without an execution signal', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const store = createMemoryAwsRequestStore();
  const update = store.update;
  const identityStarted = Promise.withResolvers<void>();
  const identity = Promise.withResolvers<string>();
  const lockStarted = Promise.withResolvers<void>();
  const unlocked = Promise.withResolvers<void>();
  const queuedDispatch = vi.fn();
  const queuedRejected = vi.fn();
  const queued = withAwsServiceCallBudget(
    () => runAwsRequest('CloudWatch Logs', 'DescribeLogStreams', 'eu-west-1', queuedDispatch),
    {
      resolveAccountId: () => {
        identityStarted.resolve();
        return identity.promise;
      },
      store,
    },
  ).catch(queuedRejected);
  await identityStarted.promise;
  vi.setSystemTime(1_000);
  vi.spyOn(store, 'update').mockImplementation(async (...args) => {
    lockStarted.resolve();
    await unlocked.promise;
    return update(...args);
  });
  const head = withAwsServiceCallBudget(
    () => runAwsRequest('CloudWatch Logs', 'DescribeLogStreams', 'eu-west-1', async () => 'head response'),
    { accountId: 'queued-own-deadline', store },
  );
  await lockStarted.promise;
  identity.resolve('queued-own-deadline');
  try {
    await vi.advanceTimersByTimeAsync(299_000);
    expect(queuedRejected).toHaveBeenCalledWith(expect.objectContaining({ name: 'TimeoutError' }));
    expect(queuedDispatch).not.toHaveBeenCalled();
  } finally {
    unlocked.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.all([head, queued]);
  }
  expect(vi.getTimerCount()).toBe(0);
});
