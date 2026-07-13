import { AsyncLocalStorage } from 'node:async_hooks';
import type { SdkError } from '@aws-sdk/types';
import { isTransientError } from '@smithy/service-error-classification';
import { resolveAwsAccountId } from '../client.js';
import type { AwsAccountIdResolver } from '../discovery-registry.js';
import { AwsDiscoveryError, isAwsThrottlingError, wrapAwsServiceError } from '../errors.js';

// Datasets load in parallel, and several datasets can fan out to the same
// service in the same region at once. Each loader only bounds its own
// concurrency, so a shared per-run budget caps the combined in-flight calls
// per service and region. The two dials are deliberate layers: per-loader
// `chunkItems` batches size individual requests and keep memory bounded,
// while this budget is the cross-dataset ceiling that no combination of
// loaders can exceed. Route 53 adds a process-wide limiter keyed by AWS
// account because its request-rate quota spans regions and discovery runs.
const AWS_SERVICE_CALL_CONCURRENCY = 10;
const ROUTE53_REQUEST_RATE_LIMIT = {
  maxCalls: 5,
  windowMs: 1_000,
} as const;

type AwsServiceCallSlotRelease = () => void;

type AwsServiceCallLimiter = {
  acquire: () => Promise<AwsServiceCallSlotRelease>;
};

type AwsServiceCallRateLimit = {
  maxCalls: number;
  windowMs: number;
};

const createAwsServiceCallLimiter = (
  maxConcurrentCalls: number,
  rateLimit?: AwsServiceCallRateLimit,
  onIdle?: () => void,
): AwsServiceCallLimiter => {
  let activeCalls = 0;
  let wakeTimer: ReturnType<typeof setTimeout> | undefined;
  const requestStarts: number[] = [];
  const waiters: Array<(release: AwsServiceCallSlotRelease) => void> = [];

  const discardExpiredRequestStarts = (now: number): void => {
    if (!rateLimit) {
      return;
    }

    while (requestStarts[0] !== undefined && requestStarts[0] <= now - rateLimit.windowMs) {
      requestStarts.shift();
    }
  };

  const dispatchWaiters = (): void => {
    if (wakeTimer) {
      clearTimeout(wakeTimer);
      wakeTimer = undefined;
    }

    const now = Date.now();
    discardExpiredRequestStarts(now);

    while (
      activeCalls < maxConcurrentCalls &&
      waiters.length > 0 &&
      (!rateLimit || requestStarts.length < rateLimit.maxCalls)
    ) {
      activeCalls += 1;

      if (rateLimit) {
        requestStarts.push(now);
      }

      waiters.shift()?.(release);
    }

    const oldestRequestStart = requestStarts[0];

    if (rateLimit && waiters.length > 0 && activeCalls < maxConcurrentCalls && oldestRequestStart !== undefined) {
      wakeTimer = setTimeout(dispatchWaiters, Math.max(0, oldestRequestStart + rateLimit.windowMs - now));
    } else if (rateLimit && onIdle && waiters.length === 0 && activeCalls === 0 && oldestRequestStart !== undefined) {
      wakeTimer = setTimeout(dispatchWaiters, Math.max(0, oldestRequestStart + rateLimit.windowMs - now));
    } else if (onIdle && waiters.length === 0 && activeCalls === 0) {
      onIdle();
    }
  };

  const release: AwsServiceCallSlotRelease = () => {
    activeCalls -= 1;
    dispatchWaiters();
  };

  return {
    acquire: () =>
      new Promise<AwsServiceCallSlotRelease>((resolve) => {
        waiters.push(resolve);
        dispatchWaiters();
      }),
  };
};

type AwsServiceCallBudget = {
  accountId?: string;
  limiters: Map<string, AwsServiceCallLimiter>;
};

const awsServiceCallBudgetContext = new AsyncLocalStorage<AwsServiceCallBudget>();
const route53AccountLimiters = new Map<string, AwsServiceCallLimiter>();

// Resolved synchronously so callers outside a budget context keep dispatching
// their AWS calls without any added microtask deferral.
const getAwsServiceCallLimiter = (service: string, region: string): AwsServiceCallLimiter | null => {
  const budget = awsServiceCallBudgetContext.getStore();

  if (!budget) {
    return null;
  }

  const isRoute53 = service === 'Amazon Route 53';
  const limiters = isRoute53 && budget.accountId ? route53AccountLimiters : budget.limiters;
  const limiterKey = isRoute53 && budget.accountId ? budget.accountId : isRoute53 ? service : `${service}:${region}`;
  let limiter = limiters.get(limiterKey);

  if (!limiter) {
    if (isRoute53 && budget.accountId) {
      let accountLimiter: AwsServiceCallLimiter;
      accountLimiter = createAwsServiceCallLimiter(AWS_SERVICE_CALL_CONCURRENCY, ROUTE53_REQUEST_RATE_LIMIT, () => {
        if (route53AccountLimiters.get(limiterKey) === accountLimiter) {
          route53AccountLimiters.delete(limiterKey);
        }
      });
      limiter = accountLimiter;
    } else {
      limiter = createAwsServiceCallLimiter(
        AWS_SERVICE_CALL_CONCURRENCY,
        isRoute53 ? ROUTE53_REQUEST_RATE_LIMIT : undefined,
      );
    }

    limiters.set(limiterKey, limiter);
  }

  return limiter;
};

/**
 * Runs a callback with a shared AWS call budget so every `withAwsServiceErrorContext`
 * call inside it is capped per service and region, across all concurrent datasets.
 * Route 53 budgets with an account ID also share their request rate across
 * concurrent callbacks in the current process.
 *
 * Calls outside a budget callback stay unbounded, preserving direct hydrator
 * usage outside discovery orchestration.
 *
 * @param fn - Callback whose AWS calls should share one concurrency budget.
 * @param options - Optional AWS account identity for account-wide service quotas.
 * @returns The callback result.
 */
export const withAwsServiceCallBudget = <T>(fn: () => Promise<T>, options: { accountId?: string } = {}): Promise<T> =>
  awsServiceCallBudgetContext.run(
    {
      accountId: options.accountId,
      limiters: new Map(),
    },
    fn,
  );

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

      const shouldRetry =
        isAwsThrottlingError(err) ||
        (service === 'Amazon Route 53' && err instanceof Error && isTransientError(err as SdkError));

      if (attempt < maxAttempts && shouldRetry) {
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
