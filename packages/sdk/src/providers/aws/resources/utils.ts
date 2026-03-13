import { AwsDiscoveryError, isAwsThrottlingError, wrapAwsServiceError } from '../errors.js';

type AwsServiceErrorContextOptions = {
  initialDelayMs?: number;
  maxAttempts?: number;
  passthrough?: (err: unknown) => boolean;
};

const sleep = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

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

/**
 * Wraps an AWS API call so service/operation/region context is preserved on failures.
 *
 * @param service - AWS service label.
 * @param operation - AWS API operation name.
 * @param region - Region where the operation ran.
 * @param execute - Deferred AWS API call.
 * @returns The successful AWS API response.
 */
export const withAwsServiceErrorContext = async <T>(
  service: string,
  operation: string,
  region: string,
  execute: () => Promise<T>,
  options: AwsServiceErrorContextOptions = {},
): Promise<T> => {
  const maxAttempts = options.maxAttempts ?? 4;
  const initialDelayMs = options.initialDelayMs ?? 200;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await execute();
    } catch (err) {
      if (options.passthrough?.(err) || err instanceof AwsDiscoveryError) {
        throw err;
      }

      if (attempt < maxAttempts && isAwsThrottlingError(err)) {
        await sleep(initialDelayMs * 2 ** (attempt - 1));
        continue;
      }

      throw wrapAwsServiceError(err, service, operation, region);
    }
  }

  throw new Error(`${service} ${operation} failed in ${region}.`);
};
