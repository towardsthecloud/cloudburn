/**
 * Splits an array into fixed-size chunks for batched AWS API calls.
 *
 * @param items - Ordered items to batch.
 * @param size - Maximum number of items per batch.
 * @returns A list of contiguous batches.
 */
export const chunkItems = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};
