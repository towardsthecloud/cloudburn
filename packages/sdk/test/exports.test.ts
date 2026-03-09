import { describe, expect, it } from 'vitest';
import { parseIaC } from '../src/index.js';

describe('sdk exports', () => {
  it('exports the autodetect parser from the package root', () => {
    expect(parseIaC).toBeTypeOf('function');
  });
});
