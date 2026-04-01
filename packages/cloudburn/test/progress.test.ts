import { describe, expect, it } from 'vitest';
import { createAsciiProgressTracker } from '../src/progress.js';

const createMockTtyStream = () => {
  const writes: string[] = [];

  return {
    stream: {
      isTTY: true,
      write: (chunk: string) => {
        writes.push(chunk);
        return true;
      },
    } as unknown as NodeJS.WriteStream,
    writes,
  };
};

describe('ascii progress tracker', () => {
  it('pads shorter labels so previous content is cleared from the terminal line', () => {
    const { stream, writes } = createMockTtyStream();
    const progress = createAsciiProgressTracker(['Load config', 'Discover resources', 'Render output'], stream);

    progress.advance('Discover resources');
    progress.advance('Render output');
    progress.finishSuccess();

    expect(writes.at(-1)).toBe('\n');
    expect(writes.at(-2)).toMatch(/\r\[##########\] Render output +$/);
  });
});
