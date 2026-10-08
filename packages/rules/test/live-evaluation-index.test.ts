import { describe, expect, it, vi } from 'vitest';
import { type LiveEvaluationContext, LiveResourceBag } from '../src/index.js';
import { getLiveEvaluationIndex } from '../src/shared/helpers.js';

const createContext = (scratch?: LiveEvaluationContext['scratch']): LiveEvaluationContext => ({
  catalog: { indexType: 'LOCAL', resources: [], searchRegion: 'eu-west-1' },
  resources: new LiveResourceBag({}),
  ...(scratch ? { scratch } : {}),
});

describe('getLiveEvaluationIndex', () => {
  it('builds once and returns the same instance across calls sharing a scratch', () => {
    const context = createContext(new WeakMap());
    const build = vi.fn(() => new Map());

    const first = getLiveEvaluationIndex(context, build);
    const second = getLiveEvaluationIndex(context, build);

    expect(build).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('builds on every call when the context carries no scratch', () => {
    const context = createContext();
    const build = vi.fn(() => new Map());

    const first = getLiveEvaluationIndex(context, build);
    const second = getLiveEvaluationIndex(context, build);

    expect(build).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
  });

  it('keeps distinct builders in distinct scratch entries', () => {
    const context = createContext(new WeakMap());
    const firstIndex = new Map([['a', 1]]);
    const secondIndex = new Map([['b', 2]]);

    expect(getLiveEvaluationIndex(context, () => firstIndex)).toBe(firstIndex);
    expect(getLiveEvaluationIndex(context, () => secondIndex)).toBe(secondIndex);
  });
});
