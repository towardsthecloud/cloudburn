import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { parseIaCFiles } from '../src/parsers/files.js';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, readdir: vi.fn(actual.readdir) };
});

it('walks a mixed source tree once and shares a bounded file-parsing pool across formats', async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'cloudburn-parser-pool-'));
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    for (let index = 0; index < 20; index += 1) {
      await fs.writeFile(join(directory, `${index}.${index % 2 === 0 ? 'tf' : 'yaml'}`), '');
    }
    const readdir = vi.mocked(fs.readdir);
    let active = 0;
    let peak = 0;
    const paths: string[] = [];
    const parseFile = async (_path: string, relativePath: string) => {
      paths.push(relativePath);
      active += 1;
      peak = Math.max(peak, active);
      await gate;
      active -= 1;
      return { diagnostics: [], resources: [] };
    };
    const run = parseIaCFiles(directory, [
      { extensions: new Set(['.tf']), parseFile },
      { extensions: new Set(['.yaml']), parseFile },
    ]);
    try {
      await vi.waitFor(() => expect(paths).toHaveLength(8), { timeout: 1000 });
    } finally {
      release();
      await run;
    }
    expect(peak).toBeLessThanOrEqual(8);
    expect(paths).toHaveLength(20);
    expect(new Set(paths).size).toBe(20);
    expect(readdir).toHaveBeenCalledOnce();
  } finally {
    release();
    vi.restoreAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
