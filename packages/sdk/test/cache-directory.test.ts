import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveCloudBurnCacheDirectory } from '../src/index.js';

describe('resolveCloudBurnCacheDirectory', () => {
  it('uses an absolute XDG_CACHE_HOME', () => {
    expect(resolveCloudBurnCacheDirectory('evidence', { XDG_CACHE_HOME: '/var/cache/user' })).toBe(
      join('/var/cache/user', 'cloudburn', 'evidence'),
    );
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['relative', 'cache'],
    ['dot-relative', './cache'],
  ])('falls back to ~/.cache when XDG_CACHE_HOME is %s', (_name, value) => {
    expect(resolveCloudBurnCacheDirectory('evidence', { XDG_CACHE_HOME: value })).toBe(
      join(homedir(), '.cache', 'cloudburn', 'evidence'),
    );
  });
});
