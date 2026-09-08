import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, expect, it } from 'vitest';
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

const lockState = (directory: string): DatabaseSync => {
  const filename = readdirSync(directory).find((name) => name.endsWith('.sqlite'));
  if (!filename) throw new Error('Expected an initialized admission database.');
  const database = new DatabaseSync(join(directory, filename));
  database.exec('BEGIN IMMEDIATE');
  return database;
};

it('recovers ten deferred completed leases while their process remains alive and idle', async () => {
  const config = {
    accountId: '111111111111',
    dataset: 'logActivity',
    overrides: { 'logs:DescribeLogStreams': { concurrency: 10, ratePerSecond: 100, burst: 100 } },
  };
  const owner = fixture.start({ ...config, requests: 10, mode: 'hold', stayAliveAfterDone: true }, 'live-recovery');
  const following = fixture.start({ ...config, requests: 20, dataset: 'logRetention' }, 'live-recovery');
  let lock: DatabaseSync | undefined;
  let cancellation: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.all([owner.ready, following.ready]);
    owner.child.send('go');
    await owner.waitFor((events) => dispatches(events).length === 10);
    lock = lockState(owner.stateDirectory);
    owner.child.send('release');
    await owner.waitFor((events) => events.some((event) => event.type === 'done'));
    expect(attempts(owner.events)).toHaveLength(10);
    expect(attempts(owner.events).every((event) => event.cleanupOutcome === 'deferred')).toBe(true);
    expect(owner.child.kill(0)).toBe(true);

    following.child.send('go');
    await following.waitFor((events) => events.some((event) => event.type === 'submitted'));
    lock.exec('ROLLBACK');
    lock.close();
    lock = undefined;
    cancellation = setTimeout(() => following.child.send('cancel'), 2_000);
    await following.completion;
    clearTimeout(cancellation);
    expect(owner.child.kill(0)).toBe(true);
    expect(owner.child.exitCode).toBeNull();
    expect(dispatches(following.events)).toHaveLength(20);
    expect(following.events.at(-1)).toEqual({ type: 'done', results: Array(20).fill('fulfilled') });
    owner.child.send('stop');
    await owner.completion;
  } finally {
    clearTimeout(cancellation);
    if (lock?.isTransaction) lock.exec('ROLLBACK');
    lock?.close();
    owner.child.kill('SIGKILL');
    following.child.kill('SIGKILL');
    await Promise.all([owner.completion, following.completion]);
  }
});

it('lets a completed process exit while its cleanup retries are still blocked by SQLite', async () => {
  const owner = fixture.start(
    { accountId: '222222222222', dataset: 'logActivity', mode: 'hold' },
    'unreferenced-recovery',
  );
  let lock: DatabaseSync | undefined;
  try {
    await owner.ready;
    owner.child.send('go');
    await owner.waitFor((events) => dispatches(events).length === 1);
    lock = lockState(owner.stateDirectory);
    owner.child.send('release');
    await owner.completion;
    expect(lock.isTransaction).toBe(true);
    expect(attempts(owner.events)).toEqual([expect.objectContaining({ cleanupOutcome: 'deferred' })]);
    expect(owner.events.at(-1)).toEqual({ type: 'done', results: ['fulfilled'] });
  } finally {
    if (lock?.isTransaction) lock.exec('ROLLBACK');
    lock?.close();
    owner.child.kill('SIGKILL');
    await owner.completion;
  }
});
