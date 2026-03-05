import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/loader.js';

describe('config loader', () => {
  it('loads default config in scaffold mode', async () => {
    const config = await loadConfig();

    expect(config.version).toBe(1);
    expect(config.profile).toBe('dev');
  });
});
