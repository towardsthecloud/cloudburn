import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { setTimeout as wait } from 'node:timers/promises';

// Defined here because this module must stay free of relative imports: tests load it in plain Node child processes.
/**
 * Resolves a per-user CloudBurn cache directory.
 *
 * Follows the XDG base directory spec: an empty or relative `XDG_CACHE_HOME` is ignored so caches never land under
 * the current working directory.
 *
 * @param name - Cache subdirectory below `cloudburn`, such as `evidence`.
 * @param env - Environment to read `XDG_CACHE_HOME` from.
 * @returns `<XDG_CACHE_HOME or ~/.cache>/cloudburn/<name>`.
 */
export const resolveCloudBurnCacheDirectory = (name: string, env: NodeJS.ProcessEnv = process.env): string => {
  const xdgCacheHome = env.XDG_CACHE_HOME;
  const root = xdgCacheHome && isAbsolute(xdgCacheHome) ? xdgCacheHome : join(homedir(), '.cache');
  return join(root, 'cloudburn', name);
};

/** Atomic storage for opaque AWS quota state shared by admission schedulers. */
export type AwsRequestStore = {
  /**
   * Reads and replaces one quota key's state without concurrent updates interleaving.
   *
   * @param key - Stable quota identity supplied by the admission scheduler.
   * @param update - Synchronous, side-effect-free transition; returning the current state skips persistent writes.
   * @param signal - Optional cancellation signal for waiting and the transaction.
   * @param options - Contention waits keep the process alive by default; set ref to false for background work.
   * @returns The result produced by the atomic transition.
   */
  update: <T>(
    key: string,
    update: (current: string | undefined) => { state: string; value: T },
    signal?: AbortSignal,
    options?: { ref?: boolean },
  ) => Promise<T>;
};

/** A local store with an explicit lease for its cached SQLite connections. */
export type LocalAwsRequestStore = AwsRequestStore & {
  /** Closes cached SQLite connections; a later update reopens them as needed. */
  close: () => void;
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

const initializeDirectory = (directory: string): void => {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
};

const mayContainState = (directory: string): boolean => {
  try {
    const existing = lstatSync(directory, { throwIfNoEntry: false });
    return existing !== undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOTDIR') return false;
    throw error;
  }
};

const initializeTemporaryDirectory = (directory: string, uid: number | undefined): void => {
  const validate = (): void => {
    const existing = lstatSync(directory, { throwIfNoEntry: false });
    if (existing?.isSymbolicLink()) throw new Error('Temporary AWS admission state must not use a symbolic link');
    if (existing && (!existing.isDirectory() || (uid !== undefined && existing.uid !== uid))) {
      throw new Error('Temporary AWS admission state must be a directory owned by the current user');
    }
  };
  validate();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  validate();
  chmodSync(directory, 0o700);
};

const initializeDefaultDirectory = (directory: string): string => {
  const existing = mayContainState(directory);
  const uid = process.getuid?.();
  const user = uid ?? createHash('sha256').update(homedir()).digest('hex').slice(0, 16);
  const root = join(tmpdir(), `cloudburn-${user}`);
  const fallback = join(root, 'aws-admission-v1');
  const existingFallback = mayContainState(fallback);
  if (existing && existingFallback) {
    throw new Error(
      'Both default and temporary AWS admission locations exist; select the active state with CLOUDBURN_AWS_ADMISSION_DIR after stopping all CloudBurn processes',
    );
  }
  if (existingFallback) {
    initializeTemporaryDirectory(root, uid);
    initializeTemporaryDirectory(fallback, uid);
    return fallback;
  }
  try {
    initializeDirectory(directory);
    return directory;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (
      existing ||
      !code ||
      !['EACCES', 'EPERM', 'EROFS', 'ENOTDIR', 'EEXIST'].includes(code) ||
      mayContainState(directory)
    ) {
      throw error;
    }
  }

  initializeTemporaryDirectory(root, uid);
  initializeTemporaryDirectory(fallback, uid);
  return fallback;
};

const MAX_OPEN_DATABASES = 32;

type Handle = {
  database: DatabaseSync;
  dev: number;
  ino: number;
  select?: StatementSync;
  insert?: StatementSync;
  version?: StatementSync;
};

/**
 * Creates host-local quota storage shared by independent processes under the same directory.
 *
 * An explicit directory takes precedence over CLOUDBURN_AWS_ADMISSION_DIR; neither permits fallback.
 * The default is <XDG_CACHE_HOME or ~/.cache>/cloudburn/aws-admission-v1; empty or relative XDG_CACHE_HOME is ignored. When this coordinator path
 * is absent and initialization fails because of permissions, a read-only filesystem, or invalid parent paths,
 * storage uses <tmpdir()>/cloudburn-<user>/aws-admission-v1. Node's tmpdir() honors TMPDIR on Unix.
 * The user component is the UID, or the first 16 SHA-256 hex characters of homedir() on platforms without getuid().
 * Temporary directories must be regular directories owned by the current UID when available, with mode 0700.
 * An existing temporary coordinator remains selected while the default coordinator path is absent.
 * Existing or uninspectable state is never abandoned after a failure; two existing locations require explicit selection.
 * Once a directory is selected, database, lock, corruption, and later directory errors remain fail-closed.
 * Each quota key reuses a cached SQLite handle, with at most 32 handles open and the least-recently-used handle
 * closed first. Handles are released by {@link LocalAwsRequestStore.close}; a later update reopens them as needed.
 *
 * @param directory - Explicit private storage directory, overriding environment-based selection without fallback.
 * @returns An atomic AWS request state store with a separate SQLite database for each hashed quota key and bounded
 *   connection reuse.
 */
export const createLocalAwsRequestStore = (directory?: string): LocalAwsRequestStore => {
  let selectedDirectory = directory ?? process.env.CLOUDBURN_AWS_ADMISSION_DIR;
  const primary = selectedDirectory ?? resolveCloudBurnCacheDirectory('aws-admission-v1');
  const handles = new Map<string, Handle>();

  const evict = (filename: string, handle: Handle): void => {
    if (handles.get(filename) === handle) handles.delete(filename);
    handle.database.close();
  };

  const remember = (filename: string, handle: Handle): void => {
    handles.delete(filename);
    handles.set(filename, handle);
    while (handles.size > MAX_OPEN_DATABASES) {
      const oldest = handles.entries().next().value as [string, Handle];
      evict(oldest[0], oldest[1]);
    }
  };

  return {
    update: async (key, update, signal, options) => {
      signal?.throwIfAborted();
      if (selectedDirectory === undefined) {
        try {
          selectedDirectory = initializeDefaultDirectory(primary);
        } catch (error) {
          throw localStateError(primary, error);
        }
      }
      const directory = selectedDirectory;
      const filename = join(directory, `${createHash('sha256').update(key).digest('hex')}.sqlite`);
      let filenameStat: ReturnType<typeof lstatSync> | undefined;
      try {
        initializeDirectory(directory);
        filenameStat = lstatSync(filename, { throwIfNoEntry: false });
        if (filenameStat?.isSymbolicLink()) {
          throw new Error('The local AWS admission database must not be a symbolic link');
        }
      } catch (error) {
        throw localStateError(directory, error);
      }

      const startedAt = performance.now();
      let firstAttempt = true;
      while (true) {
        signal?.throwIfAborted();
        if (!firstAttempt) {
          try {
            filenameStat = lstatSync(filename, { throwIfNoEntry: false });
          } catch (error) {
            throw localStateError(directory, error);
          }
        }
        firstAttempt = false;
        let handle = handles.get(filename);
        if (
          handle &&
          (filenameStat === undefined || handle.dev !== filenameStat.dev || handle.ino !== filenameStat.ino)
        ) {
          evict(filename, handle);
          handle = undefined;
        }
        let freshDatabase: DatabaseSync | undefined;
        let database: DatabaseSync | undefined;
        let applyingTransition = false;
        let evictOnError = false;
        try {
          if (!handle) {
            try {
              freshDatabase = new DatabaseSync(filename, { timeout: 0 });
              // SQLite owns the file handles: closing a separate descriptor can release another thread's POSIX locks.
              chmodSync(filename, 0o600);
              const identity = lstatSync(filename);
              handle = { database: freshDatabase, dev: identity.dev, ino: identity.ino };
              freshDatabase = undefined;
              remember(filename, handle);
            } catch (error) {
              freshDatabase?.close();
              throw error;
            }
          } else {
            remember(filename, handle);
          }
          database = handle.database;
          database.exec('BEGIN IMMEDIATE');
          handle.version ??= database.prepare('PRAGMA user_version');
          const version = handle.version.get()?.user_version;
          if (version === 0) {
            database.exec('CREATE TABLE request_state_v1 (id INTEGER PRIMARY KEY CHECK (id = 1), state TEXT NOT NULL)');
            database.exec('PRAGMA user_version = 1');
          } else if (version !== 1) {
            throw new Error(`Unsupported local AWS admission state version ${version}`);
          }
          handle.select ??= database.prepare('SELECT state FROM request_state_v1 WHERE id = 1');
          const row = handle.select.get();
          if (row !== undefined && typeof row.state !== 'string') {
            throw new Error('Invalid local AWS admission state payload');
          }
          signal?.throwIfAborted();
          applyingTransition = true;
          const next = update(row?.state as string | undefined);
          applyingTransition = false;
          signal?.throwIfAborted();
          // Refused admission can return unchanged state; the finally block releases its lock without a write commit.
          if (next.state === row?.state) return next.value;
          handle.insert ??= database.prepare('INSERT OR REPLACE INTO request_state_v1 (id, state) VALUES (1, ?)');
          handle.insert.run(next.state);
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
            evictOnError = true;
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
            if (handle && (evictOnError || handle.database.isTransaction)) evict(filename, handle);
          }
        }
        try {
          await wait(10, undefined, { signal, ref: options?.ref });
        } catch (error) {
          signal?.throwIfAborted();
          throw error;
        }
      }
    },
    close: () => {
      for (const [filename, handle] of handles) {
        try {
          evict(filename, handle);
        } catch {}
      }
      handles.clear();
    },
  };
};
