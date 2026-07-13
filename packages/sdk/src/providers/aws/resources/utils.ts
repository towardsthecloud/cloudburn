import { AsyncLocalStorage } from 'node:async_hooks';
import { resolveAwsAccountId } from '../client.js';
import type { AwsAccountIdResolver } from '../discovery-registry.js';
import { AwsDiscoveryError, isAwsThrottlingError, wrapAwsServiceError } from '../errors.js';

// Datasets load in parallel, and several datasets can fan out to the same
// service in the same region at once. Each loader only bounds its own
// concurrency, so a shared per-run budget caps the combined in-flight calls
// per service and region.
const AWS_SERVICE_CALL_CONCURRENCY = 10;

type AwsServiceCallSlotRelease = () => void;

type AwsServiceCallLimiter = {
  acquire: () => Promise<AwsServiceCallSlotRelease>;
};

const createAwsServiceCallLimiter = (maxConcurrentCalls: number): AwsServiceCallLimiter => {
  let activeCalls = 0;
  const waiters: Array<() => void> = [];

  const release: AwsServiceCallSlotRelease = () => {
    const nextWaiter = waiters.shift();

    if (nextWaiter) {
      // The slot transfers directly to the waiter, so activeCalls stays put.
      nextWaiter();
    } else {
      activeCalls -= 1;
    }
  };

  return {
    acquire: async () => {
      if (activeCalls < maxConcurrentCalls) {
        activeCalls += 1;

        return release;
      }

      await new Promise<void>((resolve) => {
        waiters.push(resolve);
      });

      return release;
    },
  };
};

const awsServiceCallBudgetContext = new AsyncLocalStorage<Map<string, AwsServiceCallLimiter>>();

// Resolved synchronously so callers outside a budget context keep dispatching
// their AWS calls without any added microtask deferral.
const getAwsServiceCallLimiter = (service: string, region: string): AwsServiceCallLimiter | null => {
  const limiters = awsServiceCallBudgetContext.getStore();

  if (!limiters) {
    return null;
  }

  const limiterKey = `${service}:${region}`;
  let limiter = limiters.get(limiterKey);

  if (!limiter) {
    limiter = createAwsServiceCallLimiter(AWS_SERVICE_CALL_CONCURRENCY);
    limiters.set(limiterKey, limiter);
  }

  return limiter;
};

/**
 * Runs a callback with a shared AWS call budget so every `withAwsServiceErrorContext`
 * call inside it is capped per service and region, across all concurrent datasets.
 *
 * Calls outside a budget callback stay unbounded, preserving direct hydrator
 * usage outside discovery orchestration.
 *
 * @param fn - Callback whose AWS calls should share one concurrency budget.
 * @returns The callback result.
 */
export const withAwsServiceCallBudget = <T>(fn: () => Promise<T>): Promise<T> =>
  awsServiceCallBudgetContext.run(new Map(), fn);

type AwsServiceErrorContextOptions = {
  initialDelayMs?: number;
  maxAttempts?: number;
  onRetry?: (details: { attempt: number; delayMs: number; error: unknown; maxAttempts: number }) => void;
  passthrough?: (err: unknown) => boolean;
};

const sleep = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

const calculateThrottleDelayMs = (initialDelayMs: number, attempt: number): number => {
  const baseDelayMs = initialDelayMs * 2 ** (attempt - 1);

  return Math.round(baseDelayMs * (1 + Math.random()));
};

/**
 * Resolves the AWS account ID through a discovery-run cache when available.
 *
 * @param context - Optional per-run account ID resolver.
 * @returns The current caller's AWS account ID.
 */
export const resolveAwsAccountIdForLoad = (context?: AwsAccountIdResolver): Promise<string> =>
  context?.resolveAccountId() ?? resolveAwsAccountId();

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
 * Extracts the terminal identifier directly from an AWS ARN.
 *
 * Some Resource Explorer `name` fields are human-readable labels instead of
 * API identifiers, so loaders can use the ARN segment when the service
 * requires the canonical identifier.
 *
 * @param arn - Full AWS ARN for the discovered resource.
 * @returns The trailing ARN identifier, or `null` when the ARN is malformed.
 */
export const extractTerminalArnResourceIdentifier = (arn: string): string | null => {
  const match = /[:/]([^:/]+)$/u.exec(arn);

  return match?.[1] ?? null;
};

/**
 * Extracts the terminal identifier from a Resource Explorer result.
 *
 * Resource Explorer resource names are not guaranteed for every service, so
 * loaders can fall back to the last ARN segment when the name is absent.
 *
 * @param resourceName - Optional resource name reported by Resource Explorer.
 * @param arn - Full AWS ARN for the discovered resource.
 * @returns The terminal identifier, or `null` when neither source is usable.
 */
export const extractTerminalResourceIdentifier = (resourceName: string | undefined, arn: string): string | null => {
  if (resourceName) {
    return resourceName;
  }

  return extractTerminalArnResourceIdentifier(arn);
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
  const maxAttempts = options.maxAttempts ?? 6;
  const initialDelayMs = options.initialDelayMs ?? 500;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // The slot is acquired per attempt and released before any backoff sleep,
    // so a call waiting out a throttle never blocks other callers.
    const limiter = getAwsServiceCallLimiter(service, region);
    const releaseSlot = limiter ? await limiter.acquire() : null;

    try {
      const result = await execute();
      releaseSlot?.();

      return result;
    } catch (err) {
      releaseSlot?.();

      if (options.passthrough?.(err) || err instanceof AwsDiscoveryError) {
        throw err;
      }

      if (attempt < maxAttempts && isAwsThrottlingError(err)) {
        const delayMs = calculateThrottleDelayMs(initialDelayMs, attempt);
        options.onRetry?.({ attempt, delayMs, error: err, maxAttempts });
        await sleep(delayMs);
        continue;
      }

      throw wrapAwsServiceError(err, service, operation, region);
    }
  }

  throw new Error(`${service} ${operation} failed in ${region}.`);
};
