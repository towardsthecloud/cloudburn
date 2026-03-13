import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { isCliEntrypoint } from '../src/cli.js';

describe('cli entrypoint detection', () => {
  const tempDirectories: string[] = [];

  afterEach(() => {
    for (const directory of tempDirectories) {
      rmSync(directory, { force: true, recursive: true });
    }
    tempDirectories.length = 0;
  });

  it('treats a symlinked executable as the CLI entrypoint', () => {
    const directory = mkdtempSync(join(tmpdir(), 'cloudburn-cli-'));
    const cliFile = join(directory, 'dist', 'cli.js');
    const symlinkPath = join(directory, 'bin', 'cloudburn');

    tempDirectories.push(directory);

    mkdirSync(dirname(cliFile), { recursive: true });
    writeFileSync(cliFile, '#!/usr/bin/env node\n');
    mkdirSync(dirname(symlinkPath), { recursive: true });
    symlinkSync(cliFile, symlinkPath);

    expect(isCliEntrypoint(pathToFileURL(cliFile).href, symlinkPath)).toBe(true);
  });
});
