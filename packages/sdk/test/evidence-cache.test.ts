import { type ChildProcess, fork } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEvidenceCache, createMemoryEvidenceCacheStore, type EvidenceCacheStore } from '../src/evidence-cache.js';

const directories: string[] = [];
const children = new Set<ChildProcess>();
const child = (path: string, value: string, mode = 'normal', leaseMs = 300) => {
  const process = fork(
    fileURLToPath(new URL('./fixtures/evidence-cache/process.mjs', import.meta.url)),
    [path, value, mode, String(leaseMs)],
    { execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  );
  children.add(process);
  const messages: Array<{
    kind: string;
    result?: { value: string; provenance: { source: string } };
    message?: string;
  }> = [];
  let stderr = '';
  process.stderr?.on('data', (data) => {
    stderr += data.toString();
  });
  process.on('message', (message) => messages.push(message as (typeof messages)[number]));
  const completion = new Promise<void>((resolve, reject) => {
    process.once('error', reject);
    process.once('exit', (code, signal) => {
      children.delete(process);
      if (code === 0 || signal === 'SIGKILL') resolve();
      else reject(new Error(`Evidence child exited ${code}: ${stderr}`));
    });
  });
  void completion.catch(() => {});
  return {
    process,
    messages,
    completion,
    until: async (kind: string) => {
      await vi.waitFor(
        () =>
          expect(
            messages.some((message) => message.kind === kind),
            stderr,
          ).toBe(true),
        { timeout: 3000, interval: 10 },
      );
      const message = messages.find((message) => message.kind === kind);
      if (!message) throw new Error(`Child did not send ${kind}`);
      return message;
    },
  };
};
const directory = async () => {
  const path = await mkdtemp(join(tmpdir(), 'cloudburn-evidence-test-'));
  directories.push(path);
  return path;
};
afterEach(async () => {
  await Promise.all(
    [...children].map(
      (process) =>
        new Promise<void>((resolve) => {
          process.once('exit', () => resolve());
          process.kill('SIGKILL');
        }),
    ),
  );
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('evidence cache', () => {
  it('reuses complete evidence across cache instances with original timestamps and Dates', async () => {
    const path = await directory();
    let now = Date.parse('2026-09-08T10:00:00.000Z');
    const load = vi.fn(async () => ({
      value: { created: new Date('2026-01-01'), diagnostics: ['synthetic'], coverage: { assessed: 1, unknown: 0 } },
      complete: true,
      observedAt: '2026-09-08T09:00:00.000Z',
    }));
    const first = await createEvidenceCache({ directory: path, now: () => now }).load({
      key: ['inventory', 1],
      ttlMs: 1000,
      load,
    });
    now += 500;
    const second = await createEvidenceCache({ directory: path, now: () => now }).load({
      key: ['inventory', 1],
      ttlMs: 1000,
      load,
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(second.value).toEqual(first.value);
    expect(second.value.created).toBeInstanceOf(Date);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.provenance).toEqual({
      source: 'cache',
      cacheStatus: 'hit',
      complete: true,
      collectedAt: '2026-09-08T10:00:00.000Z',
      observedAt: '2026-09-08T09:00:00.000Z',
    });
  });
  it('honors strict refresh even when a normal caller is simultaneously reading a fresh entry', async () => {
    const cache = createEvidenceCache();
    const load = vi.fn(async () => ({ value: 'first', complete: true }));
    await cache.load({ key: 'same', ttlMs: 1000, load });
    const normal = cache.load({ key: 'same', ttlMs: 1000, load });
    const refresh = cache.load({
      key: 'same',
      ttlMs: 1000,
      mode: 'refresh',
      load: async () => ({ value: 'second', complete: true }),
    });
    expect((await normal).value).toBe('first');
    expect((await refresh).value).toBe('second');
  });

  it('keeps a shared load alive when its first waiter cancels and aborts when the last waiter leaves', async () => {
    const cache = createEvidenceCache();
    let finish!: (value: { value: string; complete: boolean }) => void;
    let ownerSignal: AbortSignal | undefined;
    const load = vi.fn((signal: AbortSignal) => {
      ownerSignal = signal;
      return new Promise<{ value: string; complete: boolean }>((resolve) => {
        finish = resolve;
      });
    });
    const first = new AbortController();
    const second = new AbortController();
    const a = cache.load({ key: 'shared', ttlMs: 1000, signal: first.signal, load });
    const aRejected = expect(a).rejects.toThrow('first left');
    const b = cache.load({ key: 'shared', ttlMs: 1000, signal: second.signal, load });
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    first.abort(new Error('first left'));
    await aRejected;
    expect(ownerSignal?.aborted).toBe(false);
    finish({ value: 'complete', complete: true });
    expect((await b).value).toBe('complete');

    const last = new AbortController();
    const c = cache.load({ key: 'abandoned', ttlMs: 1000, signal: last.signal, load });
    const cRejected = expect(c).rejects.toThrow('last left');
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    last.abort(new Error('last left'));
    await cRejected;
    expect(ownerSignal?.aborted).toBe(true);
    finish({ value: 'late', complete: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const retry = vi.fn(async () => ({ value: 'retry', complete: true }));
    expect((await cache.load({ key: 'abandoned', ttlMs: 1000, load: retry })).value).toBe('retry');
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('recollects after partial or denied refreshes and never falls back to expired evidence', async () => {
    let now = 1_000_000;
    const cache = createEvidenceCache({ now: () => now });
    const load = vi.fn(async () => ({ value: 'complete', complete: true }));
    const request = { key: 'inventory', ttlMs: 1000, load };
    await cache.load(request);
    const partial = await cache.load({
      ...request,
      mode: 'refresh',
      load: async () => ({ value: 'unknown', complete: false }),
    });
    expect(partial.provenance.complete).toBe(false);
    expect((await cache.load(request)).value).toBe('complete');
    expect(load).toHaveBeenCalledTimes(2);
    await expect(
      cache.load({
        ...request,
        mode: 'refresh',
        load: async () => {
          throw new Error('AccessDenied');
        },
      }),
    ).rejects.toThrow('AccessDenied');
    expect((await cache.load(request)).value).toBe('complete');
    expect(load).toHaveBeenCalledTimes(3);
    now += 1000;
    const stale = await cache.load({ ...request, load: async () => ({ value: 'missing', complete: false }) });
    expect(stale.value).toBe('missing');
    expect(stale.provenance.cacheStatus).toBe('stale');
    await expect(
      cache.load({
        ...request,
        load: async () => {
          throw new Error('AccessDenied');
        },
      }),
    ).rejects.toThrow('AccessDenied');
  });

  it('bypasses all persistence and single-flight in off mode', async () => {
    const store = {
      update: vi.fn(() => {
        throw new Error('store used');
      }),
      prune: vi.fn(() => {
        throw new Error('store used');
      }),
    };
    const cache = createEvidenceCache({ store });
    const load = vi.fn(async () => ({ value: 'live', complete: true }));
    const values = await Promise.all([
      cache.load({ key: 'off', ttlMs: 1000, mode: 'off', load }),
      cache.load({ key: 'off', ttlMs: 1000, mode: 'off', load }),
    ]);
    expect(values.map((result) => result.provenance.cacheStatus)).toEqual(['off', 'off']);
    expect(load).toHaveBeenCalledTimes(2);
    expect(store.update).not.toHaveBeenCalled();
  });

  it('evicts least recently used complete entries within count and byte limits', async () => {
    const path = await directory();
    let now = 1_000_000;
    const cache = createEvidenceCache({ directory: path, maxEntries: 2, now: () => now++ });
    const load = vi.fn(async () => ({ value: 'small', complete: true }));
    const get = (key: string) => cache.load({ key, ttlMs: 10000, load });
    await get('a');
    await get('b');
    await get('a');
    await get('c');
    expect((await get('a')).provenance.source).toBe('cache');
    expect((await get('b')).provenance.source).toBe('live');
    const tiny = createEvidenceCache({ directory: path, maxBytes: 1 });
    await tiny.load({ key: 'huge', ttlMs: 10000, load });
    expect((await tiny.load({ key: 'huge', ttlMs: 10000, load })).provenance.source).toBe('live');
  });

  it('releases a cancelled owner lease promptly even when its loader ignores cancellation', async () => {
    const cache = createEvidenceCache({ leaseMs: 30_000 });
    const controller = new AbortController();
    let finish!: (value: { value: string; complete: boolean }) => void;
    const load = vi.fn(
      () =>
        new Promise<{ value: string; complete: boolean }>((resolve) => {
          finish = resolve;
        }),
    );
    const cancelled = cache.load({ key: 'cancel', ttlMs: 1000, signal: controller.signal, load });
    const rejected = expect(cancelled).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    controller.abort(new Error('cancelled'));
    await rejected;
    const retry = vi.fn(async () => ({ value: 'new', complete: true }));
    const next = cache.load({ key: 'cancel', ttlMs: 1000, load: retry });
    try {
      await vi.waitFor(() => expect(retry).toHaveBeenCalledTimes(1), { timeout: 200 });
      expect((await next).value).toBe('new');
    } finally {
      finish({ value: 'old', complete: true });
      await next;
    }
    expect((await cache.load({ key: 'cancel', ttlMs: 1000, load: retry })).value).toBe('new');
  });

  it.each([
    'corrupt',
    'obsolete',
  ] as const)('recollects %s envelopes through the hosted atomic store contract', async (status) => {
    const backing = createMemoryEvidenceCacheStore();
    let corrupt = false;
    const store: EvidenceCacheStore = {
      ...backing,
      update: (key, transition, signal) =>
        backing.update(
          key,
          (state) => {
            if (corrupt && state?.entry) {
              state = { ...state, entry: status === 'corrupt' ? '{broken' : JSON.stringify({ version: 999 }) };
              corrupt = false;
            }
            return transition(state);
          },
          signal,
        ),
    };
    const cache = createEvidenceCache({ store });
    await cache.load({ key: 'entry', ttlMs: 1000, load: async () => ({ value: 'old', complete: true }) });
    corrupt = true;
    const next = await cache.load({ key: 'entry', ttlMs: 1000, load: async () => ({ value: 'new', complete: true }) });
    expect(next.value).toBe('new');
    expect(next.provenance.cacheStatus).toBe(status);
  });

  it('isolates scope keys and refuses a stored value rejected by its schema validator', async () => {
    const cache = createEvidenceCache();
    const load = vi.fn(async () => ({ value: { count: 1 }, complete: true }));
    const key = { account: '111', authorization: 'session-a', region: 'eu-west-1', view: 'view-a', version: 1 };
    await cache.load({ key, ttlMs: 1000, load });
    for (const changed of [
      { account: '222' },
      { authorization: 'session-b' },
      { region: 'us-east-1' },
      { view: 'view-b' },
      { version: 2 },
    ]) {
      expect((await cache.load({ key: { ...key, ...changed }, ttlMs: 1000, load })).provenance.source).toBe('live');
    }
    const result = await cache.load({
      key,
      ttlMs: 1000,
      validate: (value): value is { valid: boolean } => typeof value === 'object' && value !== null && 'valid' in value,
      load: async () => ({ value: { valid: true }, complete: true }),
    });
    expect(result.value).toEqual({ valid: true });
    expect(result.provenance.cacheStatus).toBe('obsolete');
  });

  it('coalesces independent processes and renews the owner lease during long collection', async () => {
    const path = await directory();
    const first = child(path, 'owner');
    await first.until('loading');
    const second = child(path, 'duplicate');
    await second.until('ready');
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(second.messages.some((message) => message.kind === 'loading')).toBe(false);
    first.process.send('release');
    expect((await first.until('result')).result?.value).toBe('owner');
    expect((await second.until('result')).result).toMatchObject({ value: 'owner', provenance: { source: 'cache' } });
    await Promise.all([first.completion, second.completion]);
  });

  it('recovers an independent process crash without accepting unfinished evidence', async () => {
    const path = await directory();
    const crashed = child(path, 'unfinished');
    await crashed.until('loading');
    crashed.process.kill('SIGKILL');
    await crashed.completion;
    const successor = child(path, 'recovered');
    await successor.until('loading');
    successor.process.send('release');
    expect((await successor.until('result')).result?.value).toBe('recovered');
    await successor.completion;
  });

  it.skipIf(process.platform === 'win32')(
    'fences a stopped old writer after a successor has replaced its expired lease',
    async () => {
      const path = await directory();
      const old = child(path, 'old');
      await old.until('loading');
      old.process.kill('SIGSTOP');
      const current = child(path, 'current');
      await current.until('loading');
      current.process.send('release');
      expect((await current.until('result')).result?.value).toBe('current');
      await current.completion;
      old.process.send('release');
      old.process.kill('SIGCONT');
      expect((await old.until('error')).message).toContain('lease was lost');
      await old.completion;
      const final = child(path, 'unexpected');
      expect((await final.until('result')).result?.value).toBe('current');
      expect(final.messages.some((message) => message.kind === 'loading')).toBe(false);
      await final.completion;
    },
  );

  it('interrupts a process waiting for another owner without affecting the owner', async () => {
    const path = await directory();
    const owner = child(path, 'owner');
    await owner.until('loading');
    const waiter = child(path, 'waiter');
    await waiter.until('ready');
    waiter.process.send('cancel');
    expect((await waiter.until('error')).message).toBe('child cancelled');
    await waiter.completion;
    owner.process.send('release');
    expect((await owner.until('result')).result?.value).toBe('owner');
    await owner.completion;
  });
  it('gives concurrent scans independent mutable copies of their shared evidence', async () => {
    const cache = createEvidenceCache();
    const load = vi.fn(async () => ({ value: { rows: [{ tags: ['original'] }] }, complete: true }));
    const [first, second] = await Promise.all([
      cache.load({ key: 'copy', ttlMs: 1000, load }),
      cache.load({ key: 'copy', ttlMs: 1000, load }),
    ]);
    first.value.rows[0]?.tags.push('mutated');
    expect(second.value.rows).toEqual([{ tags: ['original'] }]);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it.each([
    'partial',
    'denied',
    'cancelled',
  ] as const)('invalidates retained evidence after a %s refresh until a complete load succeeds', async (failure) => {
    const path = await directory();
    const cache = createEvidenceCache({ directory: path });
    const request = { key: 'revalidation', ttlMs: 60_000 };
    await cache.load({ ...request, load: async () => ({ value: 'previous', complete: true }) });
    if (failure === 'partial') {
      expect(
        (await cache.load({ ...request, mode: 'refresh', load: async () => ({ value: 'partial', complete: false }) }))
          .value,
      ).toBe('partial');
    } else if (failure === 'denied') {
      await expect(
        cache.load({
          ...request,
          mode: 'refresh',
          load: async () => {
            throw new Error('AccessDenied');
          },
        }),
      ).rejects.toThrow('AccessDenied');
    } else {
      const controller = new AbortController();
      const load = vi.fn(() => new Promise<never>(() => {}));
      const refresh = cache.load({ ...request, mode: 'refresh', signal: controller.signal, load });
      const rejected = expect(refresh).rejects.toThrow('cancelled');
      await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
      controller.abort(new Error('cancelled'));
      await rejected;
    }
    const load = vi.fn(async () => ({ value: 'revalidated', complete: true }));
    const next = await createEvidenceCache({ directory: path }).load({ ...request, load });
    expect(load).toHaveBeenCalledTimes(1);
    expect(next.value).toBe('revalidated');
    expect(next.provenance).toMatchObject({ source: 'live', cacheStatus: 'stale' });
    expect((await cache.load({ ...request, load })).provenance.source).toBe('cache');
    expect(load).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['Map', new Map([['key', 'value']])],
    ['Set', new Set(['value'])],
    ['typed array', new Uint8Array([1, 2])],
    ['Error', new Error('diagnostic')],
  ])('rejects unsupported %s values before they become current evidence', async (_name, value) => {
    const path = await directory();
    const cache = createEvidenceCache({ directory: path });
    await expect(
      cache.load({ key: 'unsupported', ttlMs: 1000, load: async () => ({ value: { nested: value }, complete: true }) }),
    ).rejects.toThrow('unsupported object');
    const load = vi.fn(async () => ({ value: { supported: true }, complete: true }));
    const next = await createEvidenceCache({ directory: path }).load({ key: 'unsupported', ttlMs: 1000, load });
    expect(load).toHaveBeenCalledTimes(1);
    expect(next.value).toEqual({ supported: true });
    expect(next.provenance).toMatchObject({ source: 'live', cacheStatus: 'miss' });
  });

  it.each([
    'leaseMs',
    'pollMs',
    'maxEntries',
    'maxBytes',
  ] as const)('requires %s to be a positive safe integer', (option) => {
    for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => createEvidenceCache({ [option]: value })).toThrow(option);
    }
  });

  it.each(['leaseMs', 'pollMs'] as const)('keeps %s inside the supported timer range', (option) => {
    expect(() => createEvidenceCache({ [option]: 2_147_483_648 })).toThrow(option);
    expect(() => createEvidenceCache({ [option]: 2_147_483_647 })).not.toThrow();
  });
});
