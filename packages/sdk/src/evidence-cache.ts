import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { setTimeout as wait } from 'node:timers/promises';

/** Whether to reuse fresh evidence, force recollection, or bypass caching entirely. */
export type EvidenceCacheMode = 'normal' | 'refresh' | 'off';
/** Source freshness and collection status retained with normalized evidence. */
export type EvidenceCacheProvenance = {
  source: 'live' | 'cache';
  collectedAt: string;
  observedAt: string;
  observationWindow?: { start: string; end: string };
  complete: boolean;
  cacheStatus?: 'miss' | 'hit' | 'stale' | 'corrupt' | 'obsolete' | 'refresh' | 'off';
};
/** A normalized load, including diagnostics and coverage in its value. */
export type EvidenceCacheLoad<T> = {
  value: T;
  complete: boolean;
  observedAt?: string;
  observationWindow?: { start: string; end: string };
};
/** Evidence returned to a caller, with a stable dependency fingerprint. */
export type EvidenceCacheResult<T> = {
  value: T;
  fingerprint: string;
  provenance: EvidenceCacheProvenance;
};
/** Opaque entry and fenced refresh ownership shared by cache coordinators. */
export type EvidenceCacheState = {
  entry?: string;
  /** Retains the previous payload but blocks reuse until a complete refresh succeeds. */
  invalidated?: boolean;
  lease?: { token: string; expiresAt: number };
  accessedAt: number;
};
/** Hosted persistence must make each transition linearizable and eviction atomic with transitions. */
export type EvidenceCacheStore = {
  /**
   * Atomically reads and replaces one key, preserving the callback's return value.
   * @param key - Hashed evidence identity, never credentials.
   * @param transition - Synchronous pure transition, called within the store transaction.
   * @param signal - Interrupts waiting for the transaction.
   * @returns The transition result after its state is committed.
   */
  update: <T>(
    key: string,
    transition: (state: EvidenceCacheState | undefined) => { state: EvidenceCacheState; value: T },
    signal?: AbortSignal,
  ) => Promise<T>;
  /**
   * Removes least-recently-accessed inactive entries until both limits hold; live leases must be retained.
   * @param limits - Entry count, UTF-8 serialized entry bytes, and current epoch milliseconds.
   * @param signal - Interrupts waiting for eviction.
   * @returns Completion after eviction is committed.
   */
  prune: (limits: { maxEntries: number; maxBytes: number; now: number }, signal?: AbortSignal) => Promise<void>;
};
/** Cache persistence, bounded storage, and coordination settings. No persistence is used by default. */
export type EvidenceCacheOptions = {
  directory?: string;
  store?: EvidenceCacheStore;
  maxEntries?: number;
  maxBytes?: number;
  leaseMs?: number;
  pollMs?: number;
  now?: () => number;
};
/** A single evidence request; its key must contain all scope and schema dimensions. */
export type EvidenceCacheRequest<T> = {
  key: unknown;
  ttlMs: number;
  mode?: EvidenceCacheMode;
  signal?: AbortSignal;
  load: (signal: AbortSignal) => Promise<EvidenceCacheLoad<T>>;
  validate?: (value: unknown) => value is T;
};
/** The SDK-owned normalized evidence cache boundary. */
export type EvidenceCache = {
  /**
   * Reuses fresh complete evidence or coalesces a cancellable refresh.
   * @param request - Scope, freshness, loader, and independent caller cancellation.
   * @returns Evidence with original collection provenance and a dependency fingerprint.
   */
  load: <T>(request: EvidenceCacheRequest<T>) => Promise<EvidenceCacheResult<T>>;
};

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
// Tag every container, so user objects resembling Date tags cannot change type on decode.
const encode = (value: unknown): unknown => {
  if (value === undefined) return ['undefined'];
  if (value instanceof Date) return ['date', value.toISOString()];
  if (Array.isArray(value)) return ['array', value.map(encode)];
  if (value !== null && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new Error('Evidence contains an unsupported object');
    return [
      'object',
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, encode(item)]),
    ];
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Evidence contains a non-finite number');
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
    throw new Error('Evidence contains an unsupported value');
  return ['scalar', value];
};
const decode = (encoded: unknown): unknown => {
  if (!Array.isArray(encoded)) throw new Error('Invalid evidence encoding');
  const [tag, value] = encoded;
  if (tag === 'undefined') return undefined;
  if (tag === 'date' && typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(value);
  if (tag === 'array' && Array.isArray(value)) return value.map(decode);
  if (tag === 'object' && Array.isArray(value))
    return Object.fromEntries(value.map(([key, item]) => [key, decode(item)]));
  if (tag === 'scalar' && (value === null || ['string', 'number', 'boolean'].includes(typeof value))) return value;
  throw new Error('Invalid evidence encoding');
};
const serialize = (value: unknown): string => JSON.stringify(encode(value));

type Envelope = {
  version: 1;
  id: string;
  payload: string;
  checksum: string;
  fingerprint: string;
  provenance: EvidenceCacheProvenance;
};
const inspect = <T>(
  entry: string | undefined,
  request: EvidenceCacheRequest<T>,
  now: number,
  invalidated: boolean,
): { envelope?: Envelope; value?: T; status: NonNullable<EvidenceCacheProvenance['cacheStatus']> } => {
  if (!entry) return { status: 'miss' };
  try {
    const envelope = JSON.parse(entry) as Envelope;
    if (envelope.version !== 1) return { status: 'obsolete' };
    if (
      typeof envelope.id !== 'string' ||
      typeof envelope.payload !== 'string' ||
      hash(envelope.payload) !== envelope.checksum ||
      envelope.fingerprint !== hash(envelope.payload) ||
      envelope.provenance?.complete !== true ||
      !Number.isFinite(Date.parse(envelope.provenance.collectedAt)) ||
      !Number.isFinite(Date.parse(envelope.provenance.observedAt))
    )
      return { status: 'corrupt' };
    const value = decode(JSON.parse(envelope.payload)) as T;
    if (request.validate && !request.validate(value)) return { status: 'obsolete' };
    const age = now - Date.parse(envelope.provenance.collectedAt);
    return { envelope, value, status: invalidated || age < 0 || age >= request.ttlMs ? 'stale' : 'hit' };
  } catch {
    return { status: 'corrupt' };
  }
};

/**
 * Creates isolated memory storage with the same atomic contract as persistent stores.
 * @returns An in-process evidence store.
 */
export const createMemoryEvidenceCacheStore = (): EvidenceCacheStore => {
  const states = new Map<string, EvidenceCacheState>();
  return {
    update: async (key, transition, signal) => {
      signal?.throwIfAborted();
      const result = transition(states.get(key));
      if (!result.state.entry && !result.state.lease) states.delete(key);
      else states.set(key, result.state);
      return result.value;
    },
    prune: async ({ maxEntries, maxBytes, now }, signal) => {
      signal?.throwIfAborted();
      let count = states.size;
      let bytes = [...states.values()].reduce((sum, state) => sum + Buffer.byteLength(state.entry ?? ''), 0);
      for (const [key, state] of [...states.entries()].sort(([, a], [, b]) => a.accessedAt - b.accessedAt)) {
        if (state.lease && state.lease.expiresAt > now) continue;
        if (state.entry && count <= maxEntries && bytes <= maxBytes) continue;
        states.delete(key);
        count -= 1;
        bytes -= Buffer.byteLength(state.entry ?? '');
      }
    },
  };
};

/**
 * Creates private host-local SQLite persistence with atomic fenced leases and eviction.
 * @param directory - Explicit directory shared by cooperating processes; never silently falls back.
 * @returns Durable storage. Files and database handles are opened only during transactions.
 */
export const createLocalEvidenceCacheStore = (directory: string): EvidenceCacheStore => {
  const filename = join(resolve(directory), 'evidence.sqlite');
  const transaction = async <T>(apply: (database: DatabaseSync) => T, signal?: AbortSignal): Promise<T> => {
    const { DatabaseSync } = await import('node:sqlite');
    const started = performance.now();
    while (true) {
      signal?.throwIfAborted();
      let database: DatabaseSync | undefined;
      try {
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        chmodSync(directory, 0o700);
        if (lstatSync(filename, { throwIfNoEntry: false })?.isSymbolicLink())
          throw new Error('Evidence database must not be a symbolic link');
        database = new DatabaseSync(filename, { timeout: 0 });
        chmodSync(filename, 0o600);
        database.exec('PRAGMA auto_vacuum = FULL');
        database.exec('BEGIN IMMEDIATE');
        database.exec(
          'CREATE TABLE IF NOT EXISTS evidence_v1 (key TEXT PRIMARY KEY, state TEXT NOT NULL, accessed INTEGER NOT NULL, bytes INTEGER NOT NULL, lease_until INTEGER NOT NULL)',
        );
        signal?.throwIfAborted();
        const result = apply(database);
        signal?.throwIfAborted();
        database.exec('COMMIT');
        return result;
      } catch (error) {
        signal?.throwIfAborted();
        if (
          !(
            error instanceof Error &&
            'errcode' in error &&
            typeof error.errcode === 'number' &&
            (error.errcode & 0xff) === 5
          ) ||
          performance.now() - started >= 5000
        )
          throw error;
      } finally {
        try {
          if (database?.isTransaction) database.exec('ROLLBACK');
        } finally {
          database?.close();
        }
      }
      await wait(10, undefined, { signal });
    }
  };
  return {
    update: (key, transition, signal) =>
      transaction((database) => {
        const row = database.prepare('SELECT state FROM evidence_v1 WHERE key = ?').get(key);
        const current = row ? (JSON.parse(row.state as string) as EvidenceCacheState) : undefined;
        const next = transition(current);
        if (!next.state.entry && !next.state.lease) {
          database.prepare('DELETE FROM evidence_v1 WHERE key = ?').run(key);
          return next.value;
        }
        database
          .prepare(
            'INSERT OR REPLACE INTO evidence_v1 (key, state, accessed, bytes, lease_until) VALUES (?, ?, ?, ?, ?)',
          )
          .run(
            key,
            JSON.stringify(next.state),
            next.state.accessedAt,
            Buffer.byteLength(next.state.entry ?? ''),
            next.state.lease?.expiresAt ?? 0,
          );
        return next.value;
      }, signal),
    prune: (limits, signal) =>
      transaction((database) => {
        const rows = database.prepare('SELECT key, bytes, lease_until FROM evidence_v1 ORDER BY accessed ASC').all();
        let count = rows.length;
        let bytes = rows.reduce((sum, row) => sum + Number(row.bytes), 0);
        for (const row of rows) {
          if (Number(row.lease_until) > limits.now) continue;
          if (Number(row.bytes) > 0 && count <= limits.maxEntries && bytes <= limits.maxBytes) continue;
          database.prepare('DELETE FROM evidence_v1 WHERE key = ?').run(row.key as string);
          count -= 1;
          bytes -= Number(row.bytes);
        }
      }, signal),
  };
};

type Flight = { controller: AbortController; promise: Promise<EvidenceCacheResult<unknown>>; waiters: number };
const directoryFlights = new Map<string, Map<string, Flight>>();
const storeFlights = new WeakMap<EvidenceCacheStore, Map<string, Flight>>();
const waitForFlight = <T>(
  flight: Flight,
  signal: AbortSignal | undefined,
  abandon: () => void,
): Promise<EvidenceCacheResult<T>> =>
  new Promise((resolve, reject) => {
    flight.waiters += 1;
    let finished = false;
    const finish = (): boolean => {
      if (finished) return false;
      finished = true;
      signal?.removeEventListener('abort', abort);
      flight.waiters -= 1;
      if (flight.waiters === 0) abandon();
      return true;
    };
    const abort = (): void => {
      if (finish()) reject(signal?.reason);
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    flight.promise.then(
      (result) => {
        if (finish()) resolve(structuredClone(result) as EvidenceCacheResult<T>);
      },
      (error) => {
        if (finish()) reject(error);
      },
    );
  });

/**
 * Creates an evidence cache. Reuse is memory-only unless directory or store is explicitly configured.
 * @param options - Persistence, bounds, and lease timing; custom stores also supply shared coordination.
 * @returns A generic cache for normalized evidence, including Dates, diagnostics, and coverage.
 */
export const createEvidenceCache = (options: EvidenceCacheOptions = {}): EvidenceCache => {
  if (options.directory && options.store) throw new Error('Configure either an evidence directory or store');
  const leaseMs = options.leaseMs ?? 30_000;
  const pollMs = options.pollMs ?? 25;
  const maxEntries = options.maxEntries ?? 1000;
  const maxBytes = options.maxBytes ?? 128 * 1024 * 1024;
  for (const [name, value] of Object.entries({ leaseMs, pollMs, maxEntries, maxBytes })) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive safe integer`);
  }
  for (const [name, value] of Object.entries({ leaseMs, pollMs })) {
    if (value > 2_147_483_647) throw new Error(`${name} must not exceed 2147483647 milliseconds`);
  }
  const now = options.now ?? Date.now;
  const store =
    options.store ??
    (options.directory ? createLocalEvidenceCacheStore(options.directory) : createMemoryEvidenceCacheStore());
  const directory = options.directory ? resolve(options.directory) : undefined;
  const flights = (directory ? directoryFlights.get(directory) : storeFlights.get(store)) ?? new Map<string, Flight>();
  if (directory) directoryFlights.set(directory, flights);
  else storeFlights.set(store, flights);

  const collect = async <T>(
    request: EvidenceCacheRequest<T>,
    signal: AbortSignal,
    status: EvidenceCacheProvenance['cacheStatus'],
  ): Promise<EvidenceCacheResult<T>> => {
    signal.throwIfAborted();
    const loaded = await new Promise<EvidenceCacheLoad<T>>((resolve, reject) => {
      const abort = (): void => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      Promise.resolve()
        .then(() => {
          signal.throwIfAborted();
          return request.load(signal);
        })
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', abort));
    });
    signal.throwIfAborted();
    const collectedAt = new Date(now()).toISOString();
    return {
      value: loaded.value,
      fingerprint: hash(serialize(loaded.value)),
      provenance: {
        source: 'live',
        collectedAt,
        observedAt: loaded.observedAt ?? collectedAt,
        complete: loaded.complete,
        ...(loaded.observationWindow ? { observationWindow: loaded.observationWindow } : {}),
        cacheStatus: status,
      },
    };
  };
  const run = async <T>(
    request: EvidenceCacheRequest<T>,
    key: string,
    controller: AbortController,
  ): Promise<EvidenceCacheResult<T>> => {
    const signal = controller.signal;
    let baseline: string | undefined;
    let initialized = false;
    let cacheStatus: EvidenceCacheProvenance['cacheStatus'] = 'miss';
    while (true) {
      signal.throwIfAborted();
      const token = randomUUID();
      const decision = await store.update<
        ({ kind: 'hit'; result: EvidenceCacheResult<T> } | { kind: 'wait' | 'owner' }) & {
          baseline?: string;
          status: EvidenceCacheProvenance['cacheStatus'];
        }
      >(
        key,
        (state) => {
          const current = state ?? { accessedAt: now() };
          const found = inspect(current.entry, request, now(), current.invalidated === true);
          const metadata = { baseline: found.envelope?.id, status: found.status };
          if (
            found.envelope &&
            found.status === 'hit' &&
            (request.mode !== 'refresh' || (initialized && found.envelope.id !== baseline))
          ) {
            return {
              state: { ...current, accessedAt: now() },
              value: {
                kind: 'hit' as const,
                ...metadata,
                result: {
                  value: found.value as T,
                  fingerprint: found.envelope.fingerprint,
                  provenance: { ...found.envelope.provenance, source: 'cache' as const, cacheStatus: 'hit' as const },
                },
              },
            };
          }
          if (current.lease && current.lease.expiresAt > now())
            return { state: current, value: { kind: 'wait' as const, ...metadata } };
          return {
            state: { ...current, invalidated: true, lease: { token, expiresAt: now() + leaseMs } },
            value: { kind: 'owner' as const, ...metadata },
          };
        },
        signal,
      );
      if (!initialized) {
        initialized = true;
        baseline = decision.baseline;
        cacheStatus = request.mode === 'refresh' ? 'refresh' : decision.status;
      }
      if (decision.kind === 'hit') return decision.result;
      if (decision.kind === 'wait') {
        await wait(pollMs, undefined, { signal });
        continue;
      }
      let released = false;
      let renewing = false;
      let renewal: Promise<void> | undefined;
      const heartbeat = setInterval(
        () => {
          if (renewing) return;
          renewing = true;
          renewal = store
            .update(
              key,
              (state) => {
                if (!state?.lease || state.lease.token !== token || state.lease.expiresAt <= now())
                  throw new Error('Evidence cache refresh lease was lost');
                return { state: { ...state, lease: { token, expiresAt: now() + leaseMs } }, value: undefined };
              },
              signal,
            )
            .catch((error: unknown) => {
              controller.abort(error);
            })
            .finally(() => {
              renewing = false;
            });
        },
        Math.max(1, Math.floor(leaseMs / 3)),
      );
      heartbeat.unref();
      try {
        const result = await collect(request, signal, cacheStatus);
        clearInterval(heartbeat);
        await renewal;
        signal.throwIfAborted();
        const payload = serialize(result.value);
        const entryId = randomUUID();
        await store.update(
          key,
          (state) => {
            if (!state?.lease || state.lease.token !== token || state.lease.expiresAt <= now())
              throw new Error('Evidence cache refresh lease was lost');
            const { lease: _lease, ...current } = state;
            return {
              state: {
                ...current,
                accessedAt: now(),
                invalidated: !result.provenance.complete,
                ...(result.provenance.complete
                  ? {
                      entry: JSON.stringify({
                        version: 1,
                        id: entryId,
                        payload,
                        checksum: hash(payload),
                        fingerprint: result.fingerprint,
                        provenance: result.provenance,
                      } satisfies Envelope),
                    }
                  : {}),
              },
              value: undefined,
            };
          },
          signal,
        );
        released = true;
        await store.prune({ maxEntries, maxBytes, now: now() }, signal);
        return result;
      } finally {
        clearInterval(heartbeat);
        await renewal;
        // A cancelled or failed owner releases only its own lease; expired owners cannot delete successors.
        if (!released) {
          await store.update(key, (state) => {
            const current = state ?? { accessedAt: now() };
            if (current.lease?.token !== token) return { state: current, value: undefined };
            const { lease: _lease, ...released } = current;
            return { state: { ...released, invalidated: true }, value: undefined };
          });
          await store.prune({ maxEntries, maxBytes, now: now() });
        }
      }
    }
  };
  return {
    load: async <T>(request: EvidenceCacheRequest<T>): Promise<EvidenceCacheResult<T>> => {
      request.signal?.throwIfAborted();
      if (!Number.isFinite(request.ttlMs) || request.ttlMs < 0)
        throw new Error('Evidence TTL must be nonnegative and finite');
      if (request.mode === 'off') return collect(request, request.signal ?? new AbortController().signal, 'off');
      const key = hash(serialize(request.key));
      const flightKey = `${key}:${request.mode ?? 'normal'}:${request.ttlMs}`;
      let flight = flights.get(flightKey);
      if (!flight || flight.controller.signal.aborted) {
        const controller = new AbortController();
        flight = { controller, waiters: 0, promise: Promise.resolve().then(() => run(request, key, controller)) };
        flights.set(flightKey, flight);
        const created = flight;
        void flight.promise
          .finally(() => {
            if (flights.get(flightKey) === created) flights.delete(flightKey);
          })
          .catch(() => {});
      }
      const joined = flight;
      return waitForFlight<T>(joined, request.signal, () => {
        if (flights.get(flightKey) === joined) flights.delete(flightKey);
        joined.controller.abort(new Error('All evidence cache waiters cancelled or completed'));
      });
    },
  };
};
