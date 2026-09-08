import { type ChildProcess, execFileSync, fork } from 'node:child_process';
import { getEventListeners } from 'node:events';
import * as filesystem from 'node:fs';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import * as operatingSystem from 'node:os';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalAwsRequestStore, createMemoryAwsRequestStore } from '../../src/providers/aws/request-store.js';

vi.mock('node:fs', async (importOriginal) => ({ ...(await importOriginal<typeof import('node:fs')>()) }));
vi.mock('node:os', async (importOriginal) => ({ ...(await importOriginal<typeof import('node:os')>()) }));

const directories: string[] = [];
const children = new Set<ChildProcess>();

const createDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'cloudburn-admission-'));
  directories.push(directory);
  return directory;
};

const startChild = (directory: string, key: string, mode: 'hold' | 'increment', count = 0) => {
  const child = fork(
    fileURLToPath(new URL('../fixtures/aws-admission/store-process.mjs', import.meta.url)),
    [directory, key, mode, String(count)],
    { execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  );
  children.add(child);
  let stderr = '';
  child.stderr?.on('data', (data) => {
    stderr += data.toString();
  });
  const completion = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      children.delete(child);
      if (code === 0 || signal === 'SIGKILL') resolve();
      else reject(new Error(`Admission child exited ${code}: ${stderr}`));
    });
  });
  const locked = new Promise<void>((resolve, reject) => {
    child.on('message', (message) => {
      if (message === 'locked') resolve();
    });
    completion.then(resolve, reject);
  });
  void locked.catch(() => undefined);
  return { child, completion, locked };
};

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  await Promise.all(
    [...children].map(
      (child) =>
        new Promise<void>((resolve) => {
          child.once('exit', () => resolve());
          child.kill('SIGKILL');
        }),
    ),
  );
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('memory AWS request state', () => {
  it('serializes concurrent updates for one quota key and isolates other keys', async () => {
    const store = createMemoryAwsRequestStore();
    const values = await Promise.all(
      Array.from({ length: 20 }, () =>
        store.update('account:ec2:eu-west-1', (current) => {
          const next = Number(current ?? 0) + 1;
          return { state: String(next), value: next };
        }),
      ),
    );

    expect(values).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    await expect(
      store.update('account:ec2:us-east-1', (current) => ({ state: 'independent', value: current })),
    ).resolves.toBeUndefined();
    await expect(store.update('account:ec2:eu-west-1', (current) => ({ state: 'next', value: current }))).resolves.toBe(
      '20',
    );
  });
});

describe.each([
  { name: 'memory', create: createMemoryAwsRequestStore },
  { name: 'local', create: () => createLocalAwsRequestStore(createDirectory()) },
])('$name AWS state transitions', ({ create }) => {
  it('does not run a transition that was cancelled before admission', async () => {
    const store = create();
    const controller = new AbortController();
    const transition = vi.fn(() => ({ state: 'reserved', value: undefined }));
    controller.abort();

    await expect(store.update('shared-quota', transition, controller.signal)).rejects.toBe(controller.signal.reason);
    expect(transition).not.toHaveBeenCalled();
  });

  it('does not commit a transition cancelled while calculating the next state', async () => {
    const store = create();
    const controller = new AbortController();
    await store.update('shared-quota', () => ({ state: 'reserved', value: undefined }));

    await expect(
      store.update(
        'shared-quota',
        () => {
          controller.abort();
          return { state: 'released', value: undefined };
        },
        controller.signal,
      ),
    ).rejects.toBe(controller.signal.reason);
    await expect(store.update('shared-quota', (current) => ({ state: 'next', value: current }))).resolves.toBe(
      'reserved',
    );
  });

  it('preserves state and releases the transaction when the transition throws', async () => {
    const store = create();
    const failure = Object.assign(new Error('Invalid quota state'), { errcode: 5 });
    await store.update('shared-quota', () => ({ state: 'reserved', value: undefined }));

    await expect(
      store.update('shared-quota', () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    await expect(store.update('shared-quota', (current) => ({ state: 'next', value: current }))).resolves.toBe(
      'reserved',
    );
  });
});

describe('local AWS request state', () => {
  it('fails closed when both default and temporary coordinator locations already exist', async () => {
    const parent = createDirectory();
    const home = join(parent, 'home');
    const temporary = createDirectory();
    writeFileSync(home, 'not a directory');
    vi.spyOn(operatingSystem, 'homedir').mockReturnValue(home);
    vi.stubEnv('XDG_CACHE_HOME', undefined);
    vi.stubEnv('CLOUDBURN_AWS_ADMISSION_DIR', undefined);
    vi.stubEnv('TMPDIR', temporary);
    await createLocalAwsRequestStore().update('shared-quota', () => ({ state: 'temporary lease', value: undefined }));
    rmSync(home);
    mkdirSync(join(home, '.cache', 'cloudburn', 'aws-admission-v1'), { recursive: true });
    const transition = vi.fn(() => ({ state: 'unsafe', value: undefined }));

    await expect(createLocalAwsRequestStore().update('shared-quota', transition)).rejects.toThrow(
      /Both.*CLOUDBURN_AWS_ADMISSION_DIR/,
    );
    expect(transition).not.toHaveBeenCalled();
  });

  it.each(['argument', 'environment'])('keeps an explicit invalid %s directory fail-closed', async (source) => {
    const home = createDirectory();
    const temporary = createDirectory();
    const blocked = join(home, 'blocked');
    writeFileSync(blocked, 'not a directory');
    vi.spyOn(operatingSystem, 'homedir').mockReturnValue(home);
    vi.stubEnv('XDG_CACHE_HOME', undefined);
    vi.stubEnv('CLOUDBURN_AWS_ADMISSION_DIR', source === 'environment' ? blocked : undefined);
    vi.stubEnv('TMPDIR', temporary);
    const transition = vi.fn(() => ({ state: 'unsafe', value: undefined }));

    await expect(
      createLocalAwsRequestStore(source === 'argument' ? blocked : undefined).update('shared-quota', transition),
    ).rejects.toThrow(/CLOUDBURN_AWS_ADMISSION_DIR/);
    expect(transition).not.toHaveBeenCalled();
    expect(readdirSync(temporary)).toEqual([]);
    expect(readdirSync(home)).toEqual(['blocked']);
  });

  it('preserves existing default state when its directory becomes inaccessible', async () => {
    const home = createDirectory();
    const temporary = createDirectory();
    const primary = join(home, '.cache', 'cloudburn', 'aws-admission-v1');
    vi.spyOn(operatingSystem, 'homedir').mockReturnValue(home);
    vi.stubEnv('XDG_CACHE_HOME', undefined);
    vi.stubEnv('CLOUDBURN_AWS_ADMISSION_DIR', undefined);
    vi.stubEnv('TMPDIR', temporary);
    const first = createLocalAwsRequestStore();
    await first.update('shared-quota', () => ({ state: 'reserved', value: undefined }));
    const original = filesystem.chmodSync;
    vi.spyOn(filesystem, 'chmodSync').mockImplementation((...args) => {
      if (args[0] === primary) throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
      return Reflect.apply(original, filesystem, args);
    });
    const transition = vi.fn(() => ({ state: 'unsafe', value: undefined }));

    for (const store of [first, createLocalAwsRequestStore()]) {
      await expect(store.update('shared-quota', transition)).rejects.toThrow(/Permission denied/);
    }
    expect(transition).not.toHaveBeenCalled();
    expect(readdirSync(temporary)).toEqual([]);
  });

  it.each([
    'default',
    'temporary',
  ])('does not abandon corrupted %s state when opening a new store', async (location) => {
    const parent = createDirectory();
    const home = join(parent, 'home');
    const temporary = createDirectory();
    if (location === 'temporary') writeFileSync(home, 'not a directory');
    else mkdirSync(home);
    vi.spyOn(operatingSystem, 'homedir').mockReturnValue(home);
    vi.stubEnv('XDG_CACHE_HOME', undefined);
    vi.stubEnv('CLOUDBURN_AWS_ADMISSION_DIR', undefined);
    vi.stubEnv('TMPDIR', temporary);
    const first = createLocalAwsRequestStore();
    await first.update('shared-quota', () => ({ state: 'reserved', value: undefined }));
    const directory =
      location === 'default'
        ? join(home, '.cache', 'cloudburn', 'aws-admission-v1')
        : join(temporary, readdirSync(temporary)[0] as string, 'aws-admission-v1');
    writeFileSync(join(directory, readdirSync(directory)[0] as string), 'corrupted database');
    if (location === 'temporary') {
      rmSync(home);
      mkdirSync(home);
    }
    const transition = vi.fn(() => ({ state: 'unsafe', value: undefined }));

    for (const store of [first, createLocalAwsRequestStore()]) {
      await expect(store.update('shared-quota', transition)).rejects.toThrow(/file is not a database/);
    }
    expect(transition).not.toHaveBeenCalled();
    if (location === 'temporary') expect(readdirSync(home)).toEqual([]);
    else expect(readdirSync(temporary)).toEqual([]);
  });

  it.each([
    'root',
    'state',
  ])('rejects a symbolic link at the temporary %s without changing its target', async (location) => {
    const parent = createDirectory();
    const home = join(parent, 'unavailable-home');
    const temporary = createDirectory();
    const target = createDirectory();
    writeFileSync(home, 'not a directory');
    chmodSync(target, 0o755);
    vi.spyOn(operatingSystem, 'homedir').mockReturnValue(home);
    vi.stubEnv('XDG_CACHE_HOME', undefined);
    vi.stubEnv('CLOUDBURN_AWS_ADMISSION_DIR', undefined);
    vi.stubEnv('TMPDIR', temporary);
    await createLocalAwsRequestStore().update('shared-quota', () => ({ state: 'reserved', value: undefined }));
    const [userDirectory] = readdirSync(temporary);
    const root = join(temporary, userDirectory as string);
    const path = location === 'root' ? root : join(root, 'aws-admission-v1');
    rmSync(path, { recursive: true });
    symlinkSync(target, path, 'dir');

    await expect(
      createLocalAwsRequestStore().update('shared-quota', () => ({ state: 'unsafe', value: undefined })),
    ).rejects.toThrow(/symbolic link/);
    expect(statSync(target).mode & 0o777).toBe(0o755);
    expect(readdirSync(target)).toEqual([]);
  });

  it.each([
    'EACCES',
    'EROFS',
  ])('uses shared temporary state when a new default cache cannot be initialized: %s', async (code) => {
    const home = createDirectory();
    const temporary = createDirectory();
    const primary = join(home, '.cache', 'cloudburn', 'aws-admission-v1');
    vi.spyOn(operatingSystem, 'homedir').mockReturnValue(home);
    vi.stubEnv('XDG_CACHE_HOME', undefined);
    vi.stubEnv('CLOUDBURN_AWS_ADMISSION_DIR', undefined);
    vi.stubEnv('TMPDIR', temporary);
    const original = filesystem.mkdirSync;
    vi.spyOn(filesystem, 'mkdirSync').mockImplementation((...args) => {
      if (args[0] === primary) throw Object.assign(new Error('Cache cannot be created'), { code });
      return Reflect.apply(original, filesystem, args);
    });

    await createLocalAwsRequestStore().update('shared-quota', () => ({ state: 'reserved', value: undefined }));

    await expect(
      createLocalAwsRequestStore().update('shared-quota', (current) => ({ state: 'next', value: current })),
    ).resolves.toBe('reserved');
    expect(readdirSync(home)).toEqual([]);
    expect(readdirSync(temporary)).toHaveLength(1);
  });

  it('retains existing temporary quota state if the default home later becomes writable', async () => {
    const root = createDirectory();
    const home = join(root, 'unavailable-home');
    const temporary = createDirectory();
    writeFileSync(home, 'not a directory');
    vi.spyOn(operatingSystem, 'homedir').mockReturnValue(home);
    vi.stubEnv('XDG_CACHE_HOME', undefined);
    vi.stubEnv('CLOUDBURN_AWS_ADMISSION_DIR', undefined);
    vi.stubEnv('TMPDIR', temporary);
    await createLocalAwsRequestStore().update('shared-quota', () => ({ state: 'reserved', value: undefined }));
    rmSync(home);
    mkdirSync(home);

    await expect(
      createLocalAwsRequestStore().update('shared-quota', (current) => ({ state: 'next', value: current })),
    ).resolves.toBe('reserved');
    expect(readdirSync(home)).toEqual([]);
  });

  it('shares a private temporary fallback when the default home path cannot contain a cache', async () => {
    const root = createDirectory();
    const home = join(root, 'unavailable-home');
    const temporary = createDirectory();
    writeFileSync(home, 'not a directory');
    vi.spyOn(operatingSystem, 'homedir').mockReturnValue(home);
    vi.stubEnv('XDG_CACHE_HOME', undefined);
    vi.stubEnv('CLOUDBURN_AWS_ADMISSION_DIR', undefined);
    vi.stubEnv('TMPDIR', temporary);
    const first = createLocalAwsRequestStore();
    const second = createLocalAwsRequestStore();

    await first.update('shared-quota', () => ({ state: 'reserved', value: undefined }));
    const moduleUrl = new URL('../../src/providers/aws/request-store.ts', import.meta.url).href;
    execFileSync(process.execPath, [
      '--input-type=module',
      '--eval',
      `
      const { default: os } = await import('node:os');
      const { syncBuiltinESMExports } = await import('node:module');
      os.homedir = () => ${JSON.stringify(home)};
      syncBuiltinESMExports();
      const { createLocalAwsRequestStore } = await import(${JSON.stringify(moduleUrl)});
      const current = await createLocalAwsRequestStore().update('shared-quota', (state) => ({
        state: 'reserved-by-child', value: state,
      }));
      if (current !== 'reserved') throw new Error('Independent processes did not share fallback state');
    `,
    ]);

    await expect(second.update('shared-quota', (current) => ({ state: 'next', value: current }))).resolves.toBe(
      'reserved-by-child',
    );
    const [userDirectory] = readdirSync(temporary);
    expect(userDirectory).toMatch(/^cloudburn-/);
    expect(statSync(join(temporary, userDirectory as string)).mode & 0o777).toBe(0o700);
    const directory = join(temporary, userDirectory as string, 'aws-admission-v1');
    const [database] = readdirSync(directory);
    expect(database).toMatch(/^[a-f0-9]{64}\.sqlite$/);
    expect(statSync(directory).mode & 0o777).toBe(0o700);
    expect(statSync(join(directory, database as string)).mode & 0o777).toBe(0o600);
  });

  it('shares default state under XDG_CACHE_HOME instead of requiring a writable home cache', async () => {
    const home = createDirectory();
    const cache = createDirectory();
    const temporary = createDirectory();
    vi.spyOn(operatingSystem, 'homedir').mockReturnValue(home);
    vi.stubEnv('XDG_CACHE_HOME', cache);
    vi.stubEnv('CLOUDBURN_AWS_ADMISSION_DIR', undefined);
    vi.stubEnv('TMPDIR', temporary);
    const first = createLocalAwsRequestStore();
    const second = createLocalAwsRequestStore();

    await first.update('shared-quota', () => ({ state: 'reserved', value: undefined }));

    await expect(second.update('shared-quota', (current) => ({ state: 'next', value: current }))).resolves.toBe(
      'reserved',
    );
    expect(readdirSync(home)).toEqual([]);
    expect(readdirSync(join(cache, 'cloudburn', 'aws-admission-v1'))).toHaveLength(1);
  });

  it('recovers a first transaction after its process dies while creating the state schema', async () => {
    const directory = createDirectory();
    const holder = startChild(directory, 'shared-quota', 'hold');
    await holder.locked;
    holder.child.kill('SIGKILL');
    await holder.completion;

    await expect(
      createLocalAwsRequestStore(directory).update('shared-quota', (current) => ({
        state: 'new lease',
        value: current,
      })),
    ).resolves.toBeUndefined();
  });

  it('rejects an incompatible state protocol without resetting its quota history', async () => {
    const directory = createDirectory();
    const store = createLocalAwsRequestStore(directory);
    await store.update('shared-quota', () => ({ state: 'reserved', value: undefined }));
    const [filename] = readdirSync(directory);
    const database = new DatabaseSync(join(directory, filename as string));
    database.exec('PRAGMA user_version = 99');
    database.close();
    const transition = vi.fn(() => ({ state: 'reset', value: 'unsafe admission' }));

    await expect(store.update('shared-quota', transition)).rejects.toThrow(/unsupported.*version.*99/i);
    expect(transition).not.toHaveBeenCalled();
  });

  it('fails closed with an actionable error when the storage directory cannot be created', async () => {
    const directory = join(createDirectory(), 'blocked');
    writeFileSync(directory, 'existing file');
    const transition = vi.fn(() => ({ state: 'reset', value: 'unsafe admission' }));

    await expect(createLocalAwsRequestStore(directory).update('shared-quota', transition)).rejects.toThrow(
      /local AWS admission state.*CLOUDBURN_AWS_ADMISSION_DIR/,
    );
    expect(transition).not.toHaveBeenCalled();
  });

  it('fails closed with an actionable error when existing state is corrupted', async () => {
    const directory = createDirectory();
    const store = createLocalAwsRequestStore(directory);
    await store.update('shared-quota', () => ({ state: 'reserved', value: undefined }));
    const [filename] = readdirSync(directory);
    writeFileSync(join(directory, filename as string), 'corrupted database');
    const transition = vi.fn(() => ({ state: 'reset', value: 'unsafe admission' }));

    await expect(store.update('shared-quota', transition)).rejects.toThrow(
      /local AWS admission state.*CLOUDBURN_AWS_ADMISSION_DIR/,
    );
    expect(transition).not.toHaveBeenCalled();
  });

  it('persists state across store instances using private opaque filenames', async () => {
    const directory = createDirectory();
    const first = createLocalAwsRequestStore(directory);
    const second = createLocalAwsRequestStore(directory);
    const key = '123456789012:route53:global';

    await expect(first.update(key, () => ({ state: 'reserved', value: 'first lease' }))).resolves.toBe('first lease');
    await expect(second.update(key, (current) => ({ state: 'renewed', value: current }))).resolves.toBe('reserved');

    const files = readdirSync(directory);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[a-f0-9]{64}\.sqlite$/);
    expect(statSync(directory).mode & 0o777).toBe(0o700);
    expect(statSync(join(directory, files[0] as string)).mode & 0o777).toBe(0o600);
  });

  it('serializes updates from independent Node processes without losing committed state', async () => {
    const directory = createDirectory();
    const first = startChild(directory, 'shared-quota', 'increment', 20);
    const second = startChild(directory, 'shared-quota', 'increment', 20);

    await Promise.all([first.completion, second.completion]);

    await expect(
      createLocalAwsRequestStore(directory).update('shared-quota', (current) => ({
        state: current ?? '',
        value: current,
      })),
    ).resolves.toBe('40');
  });

  it('cancels a contended update without changing state or retaining abort listeners', async () => {
    const directory = createDirectory();
    const store = createLocalAwsRequestStore(directory);
    await store.update('shared-quota', () => ({ state: '10', value: undefined }));
    const holder = startChild(directory, 'shared-quota', 'hold');
    await holder.locked;
    const controller = new AbortController();
    const reason = new Error('Caller cancelled admission');
    const transition = vi.fn(() => ({ state: '20', value: undefined }));
    const pending = store.update('shared-quota', transition, controller.signal);
    const assertion = expect(pending).rejects.toBe(reason);

    controller.abort(reason);

    await assertion;
    expect(transition).not.toHaveBeenCalled();
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    holder.child.kill('SIGKILL');
    await holder.completion;
    await expect(store.update('shared-quota', (current) => ({ state: current ?? '', value: current }))).resolves.toBe(
      '10',
    );
  });

  it('bounds lock contention without blocking updates for unrelated quota keys', async () => {
    const directory = createDirectory();
    const store = createLocalAwsRequestStore(directory);
    const holder = startChild(directory, 'shared-quota', 'hold');
    await holder.locked;
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const transition = vi.fn(() => ({ state: 'pending', value: undefined }));
    const pending = store.update('shared-quota', transition);
    const assertion = expect(pending).rejects.toThrow(/locked.*CLOUDBURN_AWS_ADMISSION_DIR/);

    await expect(store.update('independent-quota', () => ({ state: 'started', value: 'admitted' }))).resolves.toBe(
      'admitted',
    );
    now = 5_001;

    await assertion;
    expect(transition).not.toHaveBeenCalled();
  });
});
