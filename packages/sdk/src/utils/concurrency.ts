/**
 * Maps items with a work-conserving fixed-size worker pool.
 *
 * @param items - Ordered items to map.
 * @param maxConcurrency - Maximum mapper calls allowed in flight.
 * @param mapper - Asynchronous mapping callback.
 * @returns Mapped results in the same order as the input items.
 */
export const mapWithConcurrency = async <T, R>(
  items: T[],
  maxConcurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runWorker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index] as T, index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(maxConcurrency, items.length) }, runWorker));

  return results;
};
