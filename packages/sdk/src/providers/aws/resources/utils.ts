export { mapWithConcurrency } from '../../../utils/concurrency.js';

import { AsyncLocalStorage } from 'node:async_hooks';
import type { SdkError } from '@aws-sdk/types';
import { isTransientError } from '@smithy/service-error-classification';
import { resolveAwsAccountId } from '../client.js';
import type { AwsAccountIdResolver } from '../discovery-registry.js';
import { AwsDiscoveryError, isAwsThrottlingError, wrapAwsServiceError } from '../errors.js';
import { runAwsServiceAttempt } from '../execution.js';

// Datasets load in parallel, and several datasets can fan out to the same
// service in the same region at once. Each loader only bounds its own
// concurrency, so a shared per-run budget caps the combined in-flight calls
// per service and region. The two dials are deliberate layers: per-loader
// `chunkItems` batches size individual requests and keep memory bounded,
// while this budget is the cross-dataset ceiling that no combination of
// loaders can exceed. Route 53 adds a process-wide limiter keyed by AWS
// account because its request-rate quota spans regions and discovery runs.
const AWS_SERVICE_CALL_CONCURRENCY = 10;

type AwsServiceCallSlotRelease = () => void;

type AwsServiceCallLimiter = {
  acquire: () => Promise<AwsServiceCallSlotRelease>;
};

type AwsServiceCallRateLimit = {
  maxCalls: number;
  windowMs: number;
};

type AwsServiceCallPolicy = {
  isRetryableError?: (err: unknown) => boolean;
  limiterScope: 'account' | 'service-region';
  maxConcurrentCalls: number;
  rateLimit?: AwsServiceCallRateLimit;
};

const AWS_SERVICE_CALL_POLICIES: Record<'default' | 'route53', AwsServiceCallPolicy> = {
  default: {
    isRetryableError: (err) => err instanceof Error && isTransientError(err as SdkError),
    limiterScope: 'service-region',
    maxConcurrentCalls: AWS_SERVICE_CALL_CONCURRENCY,
  },
  route53: {
    isRetryableError: (err) => err instanceof Error && isTransientError(err as SdkError),
    limiterScope: 'account',
    maxConcurrentCalls: AWS_SERVICE_CALL_CONCURRENCY,
    rateLimit: {
      maxCalls: 5,
      windowMs: 1_000,
    },
  },
};

type AwsServiceCallPolicyKey = keyof typeof AWS_SERVICE_CALL_POLICIES;

const createAwsServiceCallLimiter = (
  maxConcurrentCalls: number,
  rateLimit?: AwsServiceCallRateLimit,
  onIdle?: () => void,
): AwsServiceCallLimiter => {
  let activeCalls = 0;
  let nextWaiterIndex = 0;
  let wakeTimer: ReturnType<typeof setTimeout> | undefined;
  const requestStarts: number[] = [];
  const waiters: Array<(release: AwsServiceCallSlotRelease) => void> = [];

  const hasWaiters = (): boolean => nextWaiterIndex < waiters.length;

  const takeNextWaiter = (): ((release: AwsServiceCallSlotRelease) => void) | undefined => {
    const waiter = waiters[nextWaiterIndex];
    nextWaiterIndex += 1;

    if (nextWaiterIndex === waiters.length) {
      waiters.length = 0;
      nextWaiterIndex = 0;
    }

    return waiter;
  };

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
      hasWaiters() &&
      (!rateLimit || requestStarts.length < rateLimit.maxCalls)
    ) {
      activeCalls += 1;

      if (rateLimit) {
        requestStarts.push(now);
      }

      takeNextWaiter()?.(release);
    }

    const oldestRequestStart = requestStarts[0];

    if (rateLimit && hasWaiters() && activeCalls < maxConcurrentCalls && oldestRequestStart !== undefined) {
      wakeTimer = setTimeout(dispatchWaiters, Math.max(0, oldestRequestStart + rateLimit.windowMs - now));
    } else if (rateLimit && onIdle && !hasWaiters() && activeCalls === 0 && oldestRequestStart !== undefined) {
      wakeTimer = setTimeout(dispatchWaiters, Math.max(0, oldestRequestStart + rateLimit.windowMs - now));
    } else if (onIdle && !hasWaiters() && activeCalls === 0) {
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
  accountIdPromise?: Promise<string>;
  limiters: Map<string, AwsServiceCallLimiter>;
  resolveAccountId?: () => Promise<string>;
};

const awsServiceCallBudgetContext = new AsyncLocalStorage<AwsServiceCallBudget>();
const accountServiceLimiters = new Map<string, AwsServiceCallLimiter>();

const getOrCreateAwsServiceCallLimiter = (options: {
  key: string;
  limiters: Map<string, AwsServiceCallLimiter>;
  policy: AwsServiceCallPolicy;
  removeWhenIdle?: boolean;
}): AwsServiceCallLimiter => {
  const existingLimiter = options.limiters.get(options.key);

  if (existingLimiter) {
    return existingLimiter;
  }

  let limiter: AwsServiceCallLimiter;
  limiter = createAwsServiceCallLimiter(
    options.policy.maxConcurrentCalls,
    options.policy.rateLimit,
    options.removeWhenIdle
      ? () => {
          if (options.limiters.get(options.key) === limiter) {
            options.limiters.delete(options.key);
          }
        }
      : undefined,
  );
  options.limiters.set(options.key, limiter);

  return limiter;
};

const resolveBudgetAccountId = (budget: AwsServiceCallBudget): string | Promise<string> | undefined => {
  if (budget.accountId) {
    return budget.accountId;
  }

  if (!budget.resolveAccountId) {
    return undefined;
  }

  budget.accountIdPromise ??= budget.resolveAccountId();

  return budget.accountIdPromise;
};

// Resolved synchronously so callers outside a budget context keep dispatching
// their AWS calls without any added microtask deferral.
const getAwsServiceCallLimiter = (
  service: string,
  region: string,
  policyKey: AwsServiceCallPolicyKey,
): AwsServiceCallLimiter | Promise<AwsServiceCallLimiter> | null => {
  const budget = awsServiceCallBudgetContext.getStore();

  if (!budget) {
    return null;
  }

  const policy = AWS_SERVICE_CALL_POLICIES[policyKey];

  if (policy.limiterScope === 'account') {
    const accountId = resolveBudgetAccountId(budget);
    const getAccountLimiter = (resolvedAccountId: string): AwsServiceCallLimiter =>
      getOrCreateAwsServiceCallLimiter({
        key: `${policyKey}:${resolvedAccountId}`,
        limiters: accountServiceLimiters,
        policy,
        removeWhenIdle: true,
      });

    if (typeof accountId === 'string') {
      return getAccountLimiter(accountId);
    }

    if (accountId) {
      return accountId.then(getAccountLimiter);
    }
  }

  return getOrCreateAwsServiceCallLimiter({
    key: policy.limiterScope === 'account' ? policyKey : `${service}:${region}`,
    limiters: budget.limiters,
    policy,
  });
};

/**
 * Runs a callback with a shared AWS call budget so every `withAwsServiceErrorContext`
 * call inside it is capped per service and region, across all concurrent datasets.
 * Account-scoped policies share their rate limits across concurrent callbacks
 * in the current process when an account identity is available.
 *
 * Calls outside a budget callback stay unbounded, preserving direct hydrator
 * usage outside discovery orchestration.
 *
 * @param fn - Callback whose AWS calls should share one concurrency budget.
 * @param options - Optional eager or lazy AWS account identity for account-wide service quotas.
 * @returns The callback result.
 */
export const withAwsServiceCallBudget = <T>(
  fn: () => Promise<T>,
  options: { accountId?: string; resolveAccountId?: () => Promise<string> } = {},
): Promise<T> =>
  awsServiceCallBudgetContext.run(
    {
      accountId: options.accountId,
      limiters: new Map(),
      resolveAccountId: options.resolveAccountId,
    },
    fn,
  );

type AwsServiceErrorContextOptions = {
  callPolicy?: AwsServiceCallPolicyKey;
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
 * Returns the first UTC instant of the calendar month containing a date.
 *
 * @param date - Date whose UTC month should be selected.
 * @returns The first day of that UTC month at midnight.
 */
export const toUtcMonthBoundary = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

/**
 * Moves a UTC month boundary by a whole number of calendar months.
 *
 * @param date - UTC month boundary to move.
 * @param months - Signed number of calendar months to add.
 * @returns The shifted UTC month boundary.
 */
export const addUtcMonths = (date: Date, months: number): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

/**
 * Formats a date as an AWS billing API UTC calendar date.
 *
 * @param date - Date to format.
 * @returns The UTC calendar date in YYYY-MM-DD form.
 */
export const formatUtcDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Parses a complete finite numeric string returned by an AWS API.
 *
 * @param value - Numeric string to parse.
 * @returns The finite number, or `null` when the value is missing or invalid.
 */
export const parseFiniteNumber = (value: string | undefined): number | null => {
  if (!value?.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

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
 * @param options - Optional retry, passthrough, and call-budget policy settings.
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
  const callPolicy = AWS_SERVICE_CALL_POLICIES[options.callPolicy ?? 'default'];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // The slot is acquired per attempt and released before any backoff sleep,
    // so a call waiting out a throttle never blocks other callers.
    const unresolvedLimiter = getAwsServiceCallLimiter(service, region, options.callPolicy ?? 'default');
    const limiter = unresolvedLimiter instanceof Promise ? await unresolvedLimiter : unresolvedLimiter;
    const releaseSlot = limiter ? await limiter.acquire() : null;

    try {
      const result = await runAwsServiceAttempt(execute);
      releaseSlot?.();

      return result;
    } catch (err) {
      releaseSlot?.();

      if (options.passthrough?.(err) || err instanceof AwsDiscoveryError) {
        throw err;
      }

      const shouldRetry = isAwsThrottlingError(err) || callPolicy.isRetryableError?.(err) === true;

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
