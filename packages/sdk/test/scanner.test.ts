import { describe, expect, it } from 'vitest';
import { CloudBurnScanner } from '../src/scanner.js';

describe('CloudBurnScanner', () => {
  it('returns an empty static scan result in scaffold mode', async () => {
    const scanner = new CloudBurnScanner();

    const result = await scanner.scanStatic(process.cwd());

    expect(result.mode).toBe('static');
    expect(result.findings).toHaveLength(0);
  });

  it('returns an empty live scan result in scaffold mode', async () => {
    const scanner = new CloudBurnScanner();

    const result = await scanner.scanLive();

    expect(result.mode).toBe('live');
    expect(result.findings).toHaveLength(0);
  });
});
