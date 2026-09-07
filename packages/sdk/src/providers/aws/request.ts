import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { SdkError } from '@aws-sdk/types';
import { isTransientError } from '@smithy/service-error-classification';
import { AwsDiscoveryError, isAwsThrottlingError, wrapAwsServiceError } from './errors.js';
import {
  awaitAwsExecution,
  emitAwsRequestTelemetry,
  getAwsExecutionDeadline,
  getAwsExecutionSignal,
  runAwsServiceAttempt,
  throwIfAwsExecutionAborted,
  waitForAwsDelay,
} from './execution.js';
import {
  type AwsQuotaOverrides,
  type AwsQuotaPolicy,
  type AwsQuotaScope,
  resolveAwsMetricDataQuota,
  resolveAwsRequestQuota,
} from './request-policy.js';
import { type AwsRequestStore, createLocalAwsRequestStore, createMemoryAwsRequestStore } from './request-store.js';

type RateState = {
  tokens: number;
  updatedAt: number;
  starts: { at: number; cost: number }[];
};

type QuotaState = RateState & {
  policy: AwsQuotaPolicy;
  active: Record<string, { pid: number; generation: number; expiresAt: number }>;
  retryRemaining: number;
  penalty: number;
  blockedUntil: number;
  generation: number;
  lastUsedAt: number;
  dispatch?: RateState;
  datapoints?: Record<string, RateState & { policy: AwsQuotaPolicy }>;
};

type RequestBudget = {
  account: Promise<string> | string | undefined;
  resolveAccountId?: () => Promise<string>;
  fallbackId: string;
  deadline: number;
  store: AwsRequestStore;
  overrides?: AwsQuotaOverrides;
  attribution: { scanId: string; dataset?: string; collector?: string };
  onAttempt?: (event: AwsRequestAttemptTelemetry) => void;
};

const budgetContext = new AsyncLocalStorage<RequestBudget>();

/** Sanitized telemetry for one attempted admission or physical AWS attempt. */
export type AwsRequestAttemptTelemetry = {
  operation: string;
  quota: AwsQuotaScope | null;
  attribution: { scanId: string; dataset?: string; collector: string };
  attempt: number;
  retryCount: number;
  startedAtMs: number;
  queueDurationMs: number;
  transportDurationMs: number;
  dispatched: boolean;
  statusCode?: number;
  outcome: 'success' | 'throttled' | 'transient_error' | 'error' | 'cancelled' | 'retry_exhausted';
  retryOutcome: 'none' | 'scheduled' | 'exhausted' | 'not_retryable';
  datapoints?: { quota: AwsQuotaScope; cost: number };
};

/** Options shared by wrapped collectors within one scan. */
export type AwsRequestBudgetOptions = {
  accountId?: string;
  resolveAccountId?: () => Promise<string>;
  store?: AwsRequestStore;
  overrides?: AwsQuotaOverrides;
  attribution?: { dataset?: string; collector?: string };
  onAttempt?: (event: AwsRequestAttemptTelemetry) => void;
};

const resolveOverrides = (provided?: AwsQuotaOverrides): AwsQuotaOverrides | undefined => {
  const configured = process.env.CLOUDBURN_AWS_QUOTA_OVERRIDES;
  if (provided === undefined && configured === undefined) return undefined;
  let value: unknown;
  try {
    value = provided ?? JSON.parse(configured as string);
  } catch {
    throw new RangeError('CLOUDBURN_AWS_QUOTA_OVERRIDES must be a JSON object of quota policies.');
  }
  const isRecord = (entry: unknown): entry is Record<string, unknown> =>
    typeof entry === 'object' && entry !== null && !Array.isArray(entry);
  if (!isRecord(value) || Object.values(value).some((entry) => !isRecord(entry))) {
    throw new RangeError('CLOUDBURN_AWS_QUOTA_OVERRIDES and each quota policy must be objects.');
  }
  return value as AwsQuotaOverrides;
};

/**
 * Runs collectors with quota admission shared by account, independently of credential caches.
 * @param fn - Collector work retaining the existing wrapper interface.
 * @param options - Account identity, optional local store and quota overrides.
 * @returns The collector result.
 */
export const withAwsServiceCallBudget = <T>(
  fn: () => Promise<T>,
  options: AwsRequestBudgetOptions = {},
): Promise<T> => {
  return budgetContext.run(
    {
      account: options.accountId,
      attribution: { scanId: randomUUID(), ...options.attribution },
      onAttempt: options.onAttempt,
      resolveAccountId: options.resolveAccountId,
      fallbackId: `unresolved:${randomUUID()}`,
      deadline: getAwsExecutionDeadline() ?? Date.now() + 300_000,
      store:
        options.store ??
        (options.accountId || options.resolveAccountId ? createLocalAwsRequestStore() : createMemoryAwsRequestStore()),
      overrides: resolveOverrides(options.overrides),
    },
    fn,
  );
};

const accountIdFor = async (budget: RequestBudget): Promise<string> => {
  budget.account ??= budget.resolveAccountId?.() ?? budget.fallbackId;
  return awaitAwsExecution(Promise.resolve(budget.account));
};

const processAlive = (pid: number): boolean => {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
};

const quotaKey = (scope: AwsQuotaScope): string =>
  JSON.stringify([
    scope.partition,
    scope.accountId,
    scope.region ?? null,
    scope.service,
    scope.group,
    scope.resource ?? null,
  ]);

type AttemptOutcome = 'success' | 'retryable' | 'error' | 'cancelled';
type DatapointQuota = ReturnType<typeof resolveAwsMetricDataQuota>;
type Admission = {
  dispatch: (datapoints?: DatapointQuota) => Promise<void>;
  finish: (outcome: AttemptOutcome) => Promise<void>;
};

const initialRateState = (policy: AwsQuotaPolicy, now: number): RateState => ({
  tokens: policy.burst,
  updatedAt: now,
  starts: [],
});

const rateWait = (state: RateState, policy: AwsQuotaPolicy, now: number, cost: number, penalty: number): number => {
  if (cost > policy.burst) throw new RangeError('AWS quota burst must accommodate one request cost.');
  const windowMs = Math.max(1000, 1000 / policy.ratePerSecond);
  state.starts = state.starts.filter((start) => start.at > now - windowMs);
  const refillRate = policy.ratePerSecond / 2 ** penalty;
  state.tokens = Math.min(policy.burst, state.tokens + (Math.max(0, now - state.updatedAt) * refillRate) / 1000);
  state.updatedAt = Math.max(now, state.updatedAt);
  let delay = state.tokens < cost ? Math.ceil(((cost - state.tokens) * 1000) / refillRate) : 0;
  let used = state.starts.reduce((sum, start) => sum + start.cost, 0);
  for (const start of state.starts) {
    if (used + cost <= Math.max(1, policy.ratePerSecond)) break;
    delay = Math.max(delay, start.at + windowMs - now);
    used -= start.cost;
  }
  return delay;
};

const consume = (state: RateState, now: number, cost: number): void => {
  state.tokens -= cost;
  state.starts.push({ at: now, cost });
};

const stricterPolicy = (current: AwsQuotaPolicy, requested: AwsQuotaPolicy): AwsQuotaPolicy => ({
  ratePerSecond: Math.min(current.ratePerSecond, requested.ratePerSecond),
  burst: Math.min(current.burst, requested.burst),
  concurrency: Math.min(current.concurrency, requested.concurrency),
  retryCapacity: Math.min(current.retryCapacity, requested.retryCapacity),
});

const waitForAdmission = (delay: number, deadline: number): Promise<void> =>
  waitForAwsDelay(Math.max(1, Math.min(delay, deadline - Date.now(), 2_147_483_647)));

const acquire = async (
  budget: RequestBudget,
  scope: AwsQuotaScope,
  policy: AwsQuotaPolicy,
  retry = false,
): Promise<Admission | null> => {
  const key = quotaKey(scope);
  const id = randomUUID();
  for (;;) {
    throwIfAwsExecutionAborted();
    if (Date.now() >= budget.deadline) throw new DOMException('AWS request admission expired.', 'TimeoutError');
    const wait = await budget.store.update(
      key,
      (serialized) => {
        const now = Date.now();
        const state: QuotaState = serialized
          ? JSON.parse(serialized)
          : {
              policy,
              tokens: policy.burst,
              updatedAt: now,
              starts: [],
              active: {},
              retryRemaining: policy.retryCapacity,
              penalty: 0,
              blockedUntil: 0,
              generation: 0,
              lastUsedAt: now,
            };
        for (const [lease, owner] of Object.entries(state.active))
          if (owner.expiresAt <= now || !processAlive(owner.pid)) delete state.active[lease];
        if (!Object.keys(state.active).length && now - state.lastUsedAt >= 60_000 && state.penalty === 0) {
          state.policy = policy;
          state.retryRemaining = policy.retryCapacity;
          state.dispatch = undefined;
          state.datapoints = undefined;
        }
        // Overlapping processes with different overrides use the stricter policy.
        state.policy = stricterPolicy(state.policy, policy);
        const effective = state.policy;
        state.retryRemaining = Math.min(state.retryRemaining, effective.retryCapacity);
        if (retry && state.retryRemaining <= 0) return { state: JSON.stringify(state), value: -1 };
        const delay = Math.max(
          0,
          state.blockedUntil - now,
          Object.keys(state.active).length >= effective.concurrency ? 10 : 0,
          rateWait(state, effective, now, 1, state.penalty),
        );
        if (delay <= 0) {
          consume(state, now, 1);
          state.active[id] = { pid: process.pid, generation: state.generation, expiresAt: budget.deadline };
          state.lastUsedAt = now;
          if (retry) state.retryRemaining -= 1;
        }
        return { state: JSON.stringify(state), value: delay };
      },
      getAwsExecutionSignal(),
    );
    if (wait === -1) return null;
    if (wait <= 0) break;
    await waitForAdmission(wait, budget.deadline);
  }
  let completion: Promise<void> | undefined;
  return {
    dispatch: async (points) => {
      for (;;) {
        throwIfAwsExecutionAborted();
        const delay = await budget.store.update(
          key,
          (serialized) => {
            const now = Date.now();
            const state: QuotaState = JSON.parse(serialized as string);
            const owner = state.active[id];
            if (!owner || owner.expiresAt <= now)
              throw new DOMException('AWS request admission expired before dispatch.', 'TimeoutError');
            state.dispatch ??= initialRateState(state.policy, now);
            let wait = Math.max(
              0,
              state.blockedUntil - now,
              rateWait(state.dispatch, state.policy, now, 1, state.penalty),
            );
            let pointState: (RateState & { policy: AwsQuotaPolicy }) | undefined;
            if (points) {
              state.datapoints ??= {};
              pointState = state.datapoints[points.scope.group] ?? {
                ...initialRateState(points.policy, now),
                policy: points.policy,
              };
              state.datapoints[points.scope.group] = pointState;
              pointState.policy = stricterPolicy(pointState.policy, points.policy);
              wait = Math.max(wait, rateWait(pointState, pointState.policy, now, points.cost, 0));
            }
            if (wait <= 0) {
              consume(state.dispatch, now, 1);
              if (points && pointState) consume(pointState, now, points.cost);
              owner.generation = state.generation;
            }
            return { state: JSON.stringify(state), value: wait };
          },
          getAwsExecutionSignal(),
        );
        if (delay <= 0) return;
        await waitForAdmission(delay, budget.deadline);
      }
    },
    finish: (outcome) => {
      completion ??= budget.store.update(key, (serialized) => {
        const state: QuotaState = JSON.parse(serialized as string);
        const lease = state.active[id];
        if (!lease) return { state: JSON.stringify(state), value: undefined };
        delete state.active[id];
        state.lastUsedAt = Date.now();
        if (outcome === 'retryable') {
          state.generation += 1;
          state.penalty = Math.min(5, state.penalty + 1);
          state.blockedUntil = Math.max(state.blockedUntil, Date.now() + 500 * 2 ** (state.penalty - 1));
          state.tokens = Math.min(state.tokens, 1);
          if (state.dispatch) state.dispatch.tokens = Math.min(state.dispatch.tokens, 1);
        } else if (outcome === 'success') {
          state.retryRemaining = Math.min(state.policy.retryCapacity, state.retryRemaining + 1);
          // Earlier in-flight successes are not recovery probes for a newer throttle.
          if (lease?.generation === state.generation) {
            state.penalty = Math.max(0, state.penalty - 1);
            state.blockedUntil = 0;
          }
        }
        return { state: JSON.stringify(state), value: undefined };
      });
      return completion;
    },
  };
};

/** Optional compatibility settings for one collector request. */
export type AwsServiceErrorContextOptions = {
  callPolicy?: 'default' | 'route53';
  initialDelayMs?: number;
  maxAttempts?: number;
  onRetry?: (details: { attempt: number; delayMs: number; error: unknown; maxAttempts: number }) => void;
  passthrough?: (err: unknown) => boolean;
};

const statusCodeOf = (value: unknown): number | undefined => {
  if (typeof value !== 'object' || value === null || !('$metadata' in value)) return undefined;
  const metadata = value.$metadata;
  if (typeof metadata !== 'object' || metadata === null || !('httpStatusCode' in metadata)) return undefined;
  return typeof metadata.httpStatusCode === 'number' ? metadata.httpStatusCode : undefined;
};

/**
 * Owns admission and retries for one logical AWS request.
 * @param service - Collector service label.
 * @param operation - AWS operation name.
 * @param region - Requested AWS region.
 * @param execute - Single SDK call, without nested retry ownership.
 * @param options - Existing collector retry and passthrough settings.
 * @returns The successful AWS response.
 */
export const runAwsRequest = async <T>(
  service: string,
  operation: string,
  region: string,
  execute: () => Promise<T>,
  options: AwsServiceErrorContextOptions = {},
): Promise<T> => {
  const budget = budgetContext.getStore();
  const quota = budget
    ? resolveAwsRequestQuota(service, operation, region, await accountIdFor(budget), {
        callPolicy: options.callPolicy,
        overrides: budget.overrides,
      })
    : undefined;
  const attribution = {
    scanId: budget?.attribution.scanId ?? randomUUID(),
    collector: budget?.attribution.collector ?? `${quota?.scope.service ?? service}:${operation}`,
    ...(budget?.attribution.dataset ? { dataset: budget.attribution.dataset } : {}),
  };
  const maxAttempts = options.maxAttempts ?? 6;
  const initialDelayMs = options.initialDelayMs ?? 500;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || !Number.isFinite(initialDelayMs) || initialDelayMs < 0) {
    throw new RangeError('AWS maxAttempts must be a positive integer and initialDelayMs a finite nonnegative number.');
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const event: AwsRequestAttemptTelemetry = {
      operation,
      quota: quota?.scope ?? null,
      attribution,
      attempt,
      retryCount: attempt - 1,
      startedAtMs: Date.now(),
      queueDurationMs: 0,
      transportDurationMs: 0,
      dispatched: false,
      outcome: 'cancelled',
      retryOutcome: 'none',
    };
    let admission: Admission | null | undefined;
    let outcome: AttemptOutcome = 'cancelled';
    let transportStartedAt: number | undefined;
    let measuredTransport = false;
    let datapoints: DatapointQuota | undefined;
    let managed = false;
    let delayMs = 0;
    try {
      throwIfAwsExecutionAborted();
      admission = budget && quota ? await acquire(budget, quota.scope, quota.policy, attempt > 1) : undefined;
      event.queueDurationMs = Date.now() - event.startedAtMs;
      if (admission === null) {
        event.outcome = 'retry_exhausted';
        event.retryOutcome = 'exhausted';
        throw wrapAwsServiceError(lastError, service, operation, region);
      }
      throwIfAwsExecutionAborted();
      transportStartedAt = Date.now();
      event.dispatched = true;
      const result = await awaitAwsExecution(
        runAwsServiceAttempt(execute, {
          beforeRequest: async (input) => {
            managed = true;
            event.dispatched = false;
            transportStartedAt = undefined;
            if (!budget || !quota || quota.scope.service !== 'cloudwatch' || operation !== 'GetMetricData') return;
            datapoints = resolveAwsMetricDataQuota(input, region, quota.scope.accountId, Date.now(), budget.overrides);
            event.datapoints = { quota: datapoints.scope, cost: datapoints.cost };
          },
          beforeTransport: async () => {
            await admission?.dispatch(datapoints);
          },
          onDispatch: () => {
            event.dispatched = true;
            transportStartedAt = Date.now();
          },
          onTransport: ({ durationMs, statusCode }) => {
            measuredTransport = true;
            event.transportDurationMs += durationMs;
            event.statusCode = statusCode;
          },
        }),
      );
      outcome = 'success';
      event.outcome = 'success';
      event.statusCode ??= statusCodeOf(result);
      return result;
    } catch (error) {
      throwIfAwsExecutionAborted();
      outcome = 'error';
      event.statusCode ??= statusCodeOf(error);
      if (admission === null) throw error;
      const throttled = isAwsThrottlingError(error);
      const retryable = throttled || (error instanceof Error && isTransientError(error as SdkError));
      event.outcome = throttled ? 'throttled' : retryable ? 'transient_error' : 'error';
      if (options.passthrough?.(error) || error instanceof AwsDiscoveryError) {
        event.retryOutcome = 'not_retryable';
        throw error;
      }
      if (retryable) outcome = 'retryable';
      if (attempt >= maxAttempts || !retryable) {
        event.retryOutcome = retryable ? 'exhausted' : 'not_retryable';
        throw wrapAwsServiceError(error, service, operation, region);
      }
      lastError = error;
      event.retryOutcome = 'scheduled';
      delayMs = Math.min(30_000, Math.round(initialDelayMs * 2 ** (attempt - 1) * (1 + Math.random())));
    } finally {
      if (managed || transportStartedAt === undefined)
        event.queueDurationMs = (transportStartedAt ?? Date.now()) - event.startedAtMs;
      if (!measuredTransport && transportStartedAt !== undefined)
        event.transportDurationMs = Date.now() - transportStartedAt;
      await admission?.finish(outcome);
      emitAwsRequestTelemetry({ ...event });
      try {
        budget?.onAttempt?.({ ...event });
      } catch {
        /* Observers cannot alter retry ownership or cleanup. */
      }
    }
    options.onRetry?.({ attempt, delayMs, error: lastError, maxAttempts });
    if (delayMs > 0) await waitForAwsDelay(delayMs);
  }
  throw new Error(`${service} ${operation} failed in ${region}.`);
};
