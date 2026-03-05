import { describe, expect, it } from 'vitest';
import { createProgram } from '../src/cli.js';

describe('cli', () => {
  it('builds the cloudburn command tree', () => {
    const program = createProgram();

    expect(program.name()).toBe('cloudburn');
    expect(program.commands.map((command) => command.name())).toContain('scan');
  });
});
