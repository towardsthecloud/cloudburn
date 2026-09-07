import { once } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import { mapWithConcurrency } from '../src/utils/concurrency.js';

describe('mapWithConcurrency', () => {
  it('leaves queued items unstarted after a fatal failure in a 100-item pool', async () => {
    const activeItems = Promise.withResolvers<void>();
    const failure = new Error('Fatal mapper failure');
    const startedItems: number[] = [];
    const run = mapWithConcurrency(
      Array.from({ length: 100 }, (_, index) => index),
      10,
      async (item) => {
        startedItems.push(item);

        if (item === 0) {
          throw failure;
        }

        await activeItems.promise;

        return item;
      },
    );

    try {
      await expect(run).rejects.toBe(failure);
      expect(startedItems).toHaveLength(10);
    } finally {
      activeItems.resolve();
    }

    await setImmediate();

    expect(startedItems).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('observes late active-worker failures and lets every active mapper clean up', async () => {
    const activeItems = Promise.withResolvers<void>();
    const firstFailure = new Error('First mapper failure');
    const lateFailure = new Error('Late mapper failure');
    const cleanedUpItems: number[] = [];
    const unhandledRejection = vi.fn();
    process.on('unhandledRejection', unhandledRejection);

    try {
      const run = mapWithConcurrency([0, 1, 2, 3, 4], 4, async (item) => {
        try {
          if (item === 0) {
            throw firstFailure;
          }

          await activeItems.promise;

          if (item < 3) {
            throw lateFailure;
          }

          return item;
        } finally {
          cleanedUpItems.push(item);
        }
      });

      await expect(run).rejects.toBe(firstFailure);
      expect(cleanedUpItems).toEqual([0]);

      activeItems.resolve();
      await setImmediate();

      expect(cleanedUpItems.toSorted()).toEqual([0, 1, 2, 3]);
      expect(unhandledRejection).not.toHaveBeenCalled();
    } finally {
      activeItems.resolve();
      process.off('unhandledRejection', unhandledRejection);
    }
  });

  it('stops queued items when an active mapper rejects with the cancellation reason', async () => {
    const controller = new AbortController();
    const activeItem = Promise.withResolvers<void>();
    const reason = new Error('Discovery cancelled');
    const startedItems: number[] = [];
    const run = mapWithConcurrency([0, 1, 2], 2, async (item) => {
      startedItems.push(item);

      if (item === 0) {
        await once(controller.signal, 'abort');
        controller.signal.throwIfAborted();
      }

      await activeItem.promise;

      return item;
    });

    controller.abort(reason);

    try {
      await expect(run).rejects.toBe(reason);
    } finally {
      activeItem.resolve();
    }

    await setImmediate();

    expect(startedItems).toEqual([0, 1]);
  });

  it('preserves mapped result order while filling available worker slots', async () => {
    const slowItem = Promise.withResolvers<void>();
    const startedItems: number[] = [];
    const run = mapWithConcurrency(['first', 'second', 'third'], 2, async (item, index) => {
      startedItems.push(index);

      if (index === 0) {
        await slowItem.promise;
      }

      return `${index}:${item}`;
    });

    try {
      expect(startedItems).toEqual([0, 1]);
      await setImmediate();
      expect(startedItems).toEqual([0, 1, 2]);
    } finally {
      slowItem.resolve();
    }

    await expect(run).resolves.toEqual(['0:first', '1:second', '2:third']);
  });

  it('stops starting workers when the mapper throws synchronously', async () => {
    const failure = new Error('Synchronous mapper failure');
    const mapper = vi.fn(() => {
      throw failure;
    });

    await expect(mapWithConcurrency([0, 1, 2], 2, mapper)).rejects.toBe(failure);

    expect(mapper).toHaveBeenCalledExactlyOnceWith(0, 0);
  });
});
