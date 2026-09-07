import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequestProcessFixture, type RequestProcessEvent } from '../fixtures/aws-admission/request-runner.js';

let fixture: Awaited<ReturnType<typeof createRequestProcessFixture>>;

beforeAll(async () => {
  fixture = await createRequestProcessFixture();
});

afterAll(async () => {
  await fixture?.dispose();
});

const dispatches = (events: RequestProcessEvent[]) => events.filter((event) => event.type === 'dispatch');
const attempts = (events: RequestProcessEvent[]) =>
  events.flatMap((event) => (event.type === 'attempt' ? [event.event] : []));

describe('AWS request admission across independent processes', () => {
  it('shares rate and burst limits for fast responses from different datasets', async () => {
    const scans = ['logActivity', 'logRetention'].map((dataset) =>
      fixture.start(
        {
          accountId: '111111111111',
          dataset,
          requests: 3,
          overrides: { 'logs:DescribeLogStreams': { ratePerSecond: 4, burst: 2 } },
        },
        'fast',
      ),
    );
    await Promise.all(scans.map((scan) => scan.ready));
    for (const scan of scans) scan.child.send('go');
    await Promise.all(scans.map((scan) => scan.completion));

    const events = scans.flatMap((scan) => scan.events);
    const starts = dispatches(events)
      .map((event) => event.at)
      .sort((left, right) => left - right);
    expect(starts).toHaveLength(6);
    // With a two-request burst, the third start waits at least 250 ms for a token.
    expect(Number(starts[2]) - Number(starts[0])).toBeGreaterThanOrEqual(200);
    // At most four requests enter any one-second quota window.
    expect(Number(starts[4]) - Number(starts[0])).toBeGreaterThanOrEqual(950);
    expect(Number(starts[5]) - Number(starts[1])).toBeGreaterThanOrEqual(950);
    expect(attempts(events)).toHaveLength(6);
    expect(new Set(attempts(events).map((event) => event.attribution.dataset))).toEqual(
      new Set(['logActivity', 'logRetention']),
    );
    for (const scan of scans) {
      expect(scan.events.at(-1)).toEqual({ type: 'done', results: ['fulfilled', 'fulfilled', 'fulfilled'] });
    }
  });

  it('paces retries and shares a retry allowance across same-account scans collecting different datasets', async () => {
    const scan = (dataset: string) =>
      fixture.start(
        {
          accountId: '111111111111',
          dataset,
          mode: 'throttle',
          overrides: { 'logs:DescribeLogStreams': { ratePerSecond: 2, burst: 2, retryCapacity: 2 } },
        },
        'retries',
      );
    const first = scan('logActivity');
    const second = scan('logRetention');
    await Promise.all([first.ready, second.ready]);
    first.child.send('go');
    second.child.send('go');
    await Promise.all([first.completion, second.completion]);

    const allDispatches = dispatches([...first.events, ...second.events]).sort((left, right) => left.at - right.at);
    expect(allDispatches).toHaveLength(4); // Two initial requests share two retries, not two retries per process.
    expect(new Set(allDispatches.map((event) => event.dataset))).toEqual(new Set(['logActivity', 'logRetention']));
    for (let index = 2; index < allDispatches.length; index += 1) {
      // Allow scheduler/IPC timestamp noise while detecting independent two-request budgets.
      expect(Number(allDispatches[index]?.at) - Number(allDispatches[index - 2]?.at)).toBeGreaterThanOrEqual(950);
    }
    expect(first.events.at(-1)).toEqual({ type: 'done', results: ['rejected'] });
    expect(second.events.at(-1)).toEqual({ type: 'done', results: ['rejected'] });
    expect(attempts([...first.events, ...second.events]).filter((event) => event.dispatched)).toHaveLength(4);
  }, 15_000);

  it('allows another account, region, and operation quota to progress while one quota is occupied', async () => {
    const config = {
      accountId: '111111111111',
      dataset: 'logActivity',
      overrides: { 'logs:DescribeLogStreams': { ratePerSecond: 25, burst: 25, concurrency: 1 } },
    };
    const holder = fixture.start({ ...config, mode: 'hold' }, 'independence');
    const others = [
      fixture.start({ ...config, accountId: '222222222222' }, 'independence'),
      fixture.start({ ...config, region: 'us-east-1' }, 'independence'),
      fixture.start({ ...config, operation: 'DescribeLogGroups' }, 'independence'),
    ];
    await Promise.all([holder.ready, ...others.map((scan) => scan.ready)]);
    holder.child.send('go');
    await holder.waitFor((events) => dispatches(events).length === 1);
    for (const scan of others) scan.child.send('go');
    await Promise.all(others.map((scan) => scan.completion));

    expect(holder.events.some((event) => event.type === 'done')).toBe(false);
    for (const scan of others) {
      expect(dispatches(scan.events)).toHaveLength(1);
      expect(scan.events.at(-1)).toEqual({ type: 'done', results: ['fulfilled'] });
    }
    holder.child.send('release');
    await holder.completion;
  });

  it('recovers a concurrency slot after its active worker is killed', async () => {
    const config = {
      accountId: '111111111111',
      dataset: 'logActivity',
      overrides: { 'logs:DescribeLogStreams': { ratePerSecond: 25, burst: 25, concurrency: 1 } },
    };
    const holder = fixture.start({ ...config, mode: 'hold' }, 'recovery');
    await holder.ready;
    holder.child.send('go');
    await holder.waitFor((events) => dispatches(events).length === 1);
    holder.child.kill('SIGKILL');
    await holder.completion;

    const next = fixture.start({ ...config, dataset: 'logRetention' }, 'recovery');
    await next.ready;
    next.child.send('go');
    await next.completion;

    expect(dispatches(next.events)).toHaveLength(1);
    expect(next.events.at(-1)).toEqual({ type: 'done', results: ['fulfilled'] });
  });

  it.skipIf(process.platform === 'win32')('expires a stopped worker slot while its PID remains alive', async () => {
    const config = {
      accountId: '111111111111',
      dataset: 'logActivity',
      overrides: { 'logs:DescribeLogStreams': { ratePerSecond: 25, burst: 25, concurrency: 1 } },
    };
    const holder = fixture.start({ ...config, mode: 'hold', timeoutMs: 300 }, 'expiry');
    try {
      await holder.ready;
      holder.child.send('go');
      await holder.waitFor((events) => dispatches(events).length === 1);
      expect(holder.child.kill('SIGSTOP')).toBe(true);
      await delay(350);

      const next = fixture.start({ ...config, dataset: 'logRetention' }, 'expiry');
      await next.ready;
      next.child.send('go');
      const cancellation = setTimeout(() => next.child.send('cancel'), 1_500);
      try {
        await next.completion;
      } finally {
        clearTimeout(cancellation);
      }

      expect(holder.child.kill(0)).toBe(true);
      expect(attempts(holder.events)).toHaveLength(0);
      expect(holder.events.some((event) => event.type === 'done')).toBe(false);
      expect(dispatches(next.events)).toHaveLength(1);
      expect(next.events.at(-1)).toEqual({ type: 'done', results: ['fulfilled'] });
    } finally {
      holder.child.kill('SIGCONT');
      holder.child.kill('SIGKILL');
      await holder.completion;
    }
  });

  it('cancels queued requests without later dispatch or blocking the next process', async () => {
    const config = {
      accountId: '111111111111',
      dataset: 'logActivity',
      overrides: { 'logs:DescribeLogStreams': { ratePerSecond: 25, burst: 25, concurrency: 1 } },
    };
    const holder = fixture.start({ ...config, mode: 'hold' }, 'cancellation');
    const cancelled = fixture.start({ ...config, requests: 3 }, 'cancellation');
    await Promise.all([holder.ready, cancelled.ready]);
    holder.child.send('go');
    await holder.waitFor((events) => dispatches(events).length === 1);
    cancelled.child.send('go');
    await cancelled.waitFor((events) => events.some((event) => event.type === 'submitted'));
    cancelled.child.send('cancel');
    await cancelled.completion;

    expect(dispatches(cancelled.events)).toHaveLength(0);
    expect(attempts(cancelled.events)).toHaveLength(3);
    expect(attempts(cancelled.events)).toEqual([
      expect.objectContaining({ outcome: 'cancelled', dispatched: false }),
      expect.objectContaining({ outcome: 'cancelled', dispatched: false }),
      expect.objectContaining({ outcome: 'cancelled', dispatched: false }),
    ]);
    expect(cancelled.events.at(-1)).toEqual({ type: 'done', results: [], error: 'AbortError' });

    const next = fixture.start({ ...config, dataset: 'logRetention' }, 'cancellation');
    await next.ready;
    next.child.send('go');
    holder.child.send('release');
    await Promise.all([holder.completion, next.completion]);
    expect(dispatches(next.events)).toHaveLength(1);
    expect(next.events.at(-1)).toEqual({ type: 'done', results: ['fulfilled'] });
  });
});
