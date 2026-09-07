/**
 * Maps items with a work-conserving fixed-size worker pool.
 *
 * The first mapper failure stops queued work and rejects immediately with the
 * original reason, including cancellation. Active mapper calls keep running and
 * their rejections remain observed. Errors captured as mapper results do not stop
 * the pool.
 *
 * @param items - Ordered items to map.
 * @param maxConcurrency - Maximum mapper calls allowed in flight.
 * @param mapper - Asynchronous mapping callback.
 * @returns Mapped results in the same order as the input items.
 * @throws The first mapper failure.
 */
export const mapWithConcurrency = async <T, R>(
  items: T[],
  maxConcurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let stopped = false;

  const runWorker = async (): Promise<void> => {
    while (!stopped && nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      try {
        results[index] = await mapper(items[index] as T, index);
      } catch (error) {
        stopped = true;
        throw error;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(maxConcurrency, items.length) }, runWorker));

  return results;
};
