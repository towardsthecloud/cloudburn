import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as wait } from 'node:timers/promises';

/** Atomic storage for opaque AWS quota state shared by admission schedulers. */
export type AwsRequestStore = {
  /**
   * Reads and replaces one quota key's state without concurrent updates interleaving.
   *
   * @param key - Stable quota identity supplied by the admission scheduler.
   * @param update - Synchronous, side-effect-free transition returning the next state and result.
   * @param signal - Optional cancellation signal for waiting and the transaction.
   * @returns The result produced by the committed transition.
   */
  update: <T>(
    key: string,
    update: (current: string | undefined) => { state: string; value: T },
    signal?: AbortSignal,
  ) => Promise<T>;
};

/**
 * Creates isolated process-local quota storage without file handles or background work.
 *
 * @returns An atomic in-memory AWS request state store.
 */
export const createMemoryAwsRequestStore = (): AwsRequestStore => {
  const states = new Map<string, string>();

  return {
    update: async (key, update, signal) => {
      signal?.throwIfAborted();
      const next = update(states.get(key));
      signal?.throwIfAborted();
      states.set(key, next.state);
      return next.value;
    },
  };
};

const localStateError = (directory: string, cause: unknown): Error =>
  new Error(
    `Cannot use local AWS admission state in ${directory}: ${cause instanceof Error ? cause.message : 'unknown storage error'}. Check directory permissions and disk space; repair corrupted state only after stopping all CloudBurn processes. Configure a shared writable directory with CLOUDBURN_AWS_ADMISSION_DIR.`,
    { cause },
  );

/**
 * Creates host-local quota storage shared by independent processes under the same directory.
 *
 * @param directory - Private storage directory; defaults to CLOUDBURN_AWS_ADMISSION_DIR or the user's CloudBurn cache.
 * @returns An atomic AWS request state store with a separate SQLite database for each hashed quota key.
 */
export const createLocalAwsRequestStore = (
  directory = process.env.CLOUDBURN_AWS_ADMISSION_DIR ?? join(homedir(), '.cache', 'cloudburn', 'aws-admission-v1'),
): AwsRequestStore => ({
  update: async (key, update, signal) => {
    signal?.throwIfAborted();
    const filename = join(directory, `${createHash('sha256').update(key).digest('hex')}.sqlite`);
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      chmodSync(directory, 0o700);
      if (lstatSync(filename, { throwIfNoEntry: false })?.isSymbolicLink()) {
        throw new Error('The local AWS admission database must not be a symbolic link');
      }
    } catch (error) {
      throw localStateError(directory, error);
    }

    const startedAt = performance.now();
    while (true) {
      signal?.throwIfAborted();
      let database: DatabaseSync | undefined;
      let applyingTransition = false;
      try {
        database = new DatabaseSync(filename, { timeout: 0 });
        // SQLite owns the file handles: closing a separate descriptor can release another thread's POSIX locks.
        chmodSync(filename, 0o600);
        database.exec('BEGIN IMMEDIATE');
        const version = database.prepare('PRAGMA user_version').get()?.user_version;
        if (version === 0) {
          database.exec('CREATE TABLE request_state_v1 (id INTEGER PRIMARY KEY CHECK (id = 1), state TEXT NOT NULL)');
          database.exec('PRAGMA user_version = 1');
        } else if (version !== 1) {
          throw new Error(`Unsupported local AWS admission state version ${version}`);
        }
        const row = database.prepare('SELECT state FROM request_state_v1 WHERE id = 1').get();
        if (row !== undefined && typeof row.state !== 'string') {
          throw new Error('Invalid local AWS admission state payload');
        }
        signal?.throwIfAborted();
        applyingTransition = true;
        const next = update(row?.state as string | undefined);
        applyingTransition = false;
        signal?.throwIfAborted();
        database.prepare('INSERT OR REPLACE INTO request_state_v1 (id, state) VALUES (1, ?)').run(next.state);
        signal?.throwIfAborted();
        database.exec('COMMIT');
        return next.value;
      } catch (error) {
        signal?.throwIfAborted();
        if (applyingTransition) throw error;
        if (
          !(
            error instanceof Error &&
            'errcode' in error &&
            typeof error.errcode === 'number' &&
            (error.errcode & 0xff) === 5
          )
        ) {
          throw localStateError(directory, error);
        }
        if (performance.now() - startedAt >= 5_000) {
          throw new Error(
            `Local AWS admission state stayed locked for 5 seconds in ${directory}. Stop the process holding the transaction, or set CLOUDBURN_AWS_ADMISSION_DIR to a writable private directory shared by your workers.`,
            { cause: error },
          );
        }
      } finally {
        try {
          if (database?.isTransaction) database.exec('ROLLBACK');
        } finally {
          database?.close();
        }
      }
      try {
        await wait(10, undefined, { signal });
      } catch (error) {
        signal?.throwIfAborted();
        throw error;
      }
    }
  },
});
