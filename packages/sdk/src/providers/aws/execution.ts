import { AsyncLocalStorage } from 'node:async_hooks';
import { setMaxListeners } from 'node:events';
import type {
  HttpHandlerOptions,
  HttpRequest,
  HttpResponse,
  RequestHandler,
  RetryStrategy,
  RetryStrategyV2,
} from '@aws-sdk/types';
import { emitDebugLog } from '../../debug.js';

const serviceAttemptContext = new AsyncLocalStorage<boolean>();
const singleAttemptStrategy: RetryStrategyV2 = {
  acquireInitialRetryToken: async () => ({
    getRetryCount: () => 0,
    getRetryDelay: () => 0,
    getRetryCost: () => undefined,
  }),
  refreshRetryTokenForRetry: async () => {
    throw new Error('The service request budget owns retries.');
  },
  recordSuccess: () => undefined,
};

type ManagedAwsClient = {
  config: {
    maxAttempts: () => Promise<number>;
    retryStrategy: () => Promise<RetryStrategy | RetryStrategyV2>;
    requestHandler: RequestHandler<HttpRequest, HttpResponse, HttpHandlerOptions>;
  };
  destroy: () => void;
};

type AwsExecution = {
  clients: Map<string, ManagedAwsClient>;
  cache: Map<string, Promise<unknown>>;
  controller: AbortController;
  debugLogger?: (message: string) => void;
  startedAtMs: number;
  deadlineMs: number;
};
const executionContext = new AsyncLocalStorage<AwsExecution>();
const DEFAULT_DISCOVERY_TIMEOUT_MS = 300_000;

/** Returns the active discovery cancellation signal, when a run is in progress. */
export const getAwsExecutionSignal = (): AbortSignal | undefined => executionContext.getStore()?.controller.signal;

/** Returns a stable timestamp for all observation windows in one discovery run. */
export const getAwsDiscoveryTimestamp = (): number => executionContext.getStore()?.startedAtMs ?? Date.now();

/** Throws the caller's cancellation reason or the expired discovery deadline. */
export const throwIfAwsExecutionAborted = (): void => {
  const execution = executionContext.getStore();
  if (execution && Date.now() >= execution.deadlineMs && !execution.controller.signal.aborted) {
    execution.controller.abort(new DOMException('AWS discovery exceeded its execution deadline.', 'TimeoutError'));
  }
  execution?.controller.signal.throwIfAborted();
};

/**
 * Waits for work while honoring the active discovery cancellation signal.
 *
 * @param work - Work whose late completion must not delay cancellation.
 * @returns The work result, or rejects with the discovery cancellation reason.
 */
export const awaitAwsExecution = <T>(work: Promise<T>): Promise<T> => {
  const signal = getAwsExecutionSignal();
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    if (signal.aborted) onAbort();
  });
};

/**
 * Waits between AWS attempts without retaining a timer after cancellation.
 *
 * @param delayMs - Retry or polling delay in milliseconds.
 * @returns Resolves after the delay or rejects when discovery is cancelled.
 */
export const waitForAwsDelay = (delayMs: number): Promise<void> => {
  const signal = getAwsExecutionSignal();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
};

/**
 * Memoizes a lookup within one discovery run, without sharing credentials or results across runs.
 *
 * @param key - Lookup identity within this execution.
 * @param load - Performs the lookup when no cached promise exists.
 * @returns The shared lookup result.
 */
export const memoizeAwsExecution = <T>(key: string, load: () => Promise<T>): Promise<T> => {
  throwIfAwsExecutionAborted();
  const execution = executionContext.getStore();
  if (!execution) return load();
  const cached = execution.cache.get(key);
  if (cached) return cached as Promise<T>;
  const work = load();
  execution.cache.set(key, work);
  return work;
};

/**
 * Runs discovery with a deadline, cancellation, isolated caches, and owned AWS clients.
 *
 * @param options - Caller cancellation, total timeout, and optional debug logger.
 * @param execute - Discovery operation, including configuration and credential resolution.
 * @returns The completed result; cancelled runs reject instead of returning partial findings.
 */
export const withAwsDiscoveryExecution = async <T>(
  options: { signal?: AbortSignal; timeoutMs?: number; debugLogger?: (message: string) => void },
  execute: () => Promise<T>,
): Promise<T> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new RangeError('Discovery timeoutMs must be a positive integer no greater than 2147483647.');
  }
  options.signal?.throwIfAborted();
  const controller = new AbortController();
  setMaxListeners(0, controller.signal);
  const startedAtMs = Date.now();
  const execution: AwsExecution = {
    clients: new Map(),
    cache: new Map(),
    controller,
    startedAtMs,
    deadlineMs: startedAtMs + timeoutMs,
    debugLogger: options.debugLogger,
  };
  const onAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new DOMException(`AWS discovery exceeded ${timeoutMs} ms.`, 'TimeoutError')),
    timeoutMs,
  );
  try {
    return await executionContext.run(execution, () =>
      awaitAwsExecution(
        Promise.resolve().then(() => {
          throwIfAwsExecutionAborted();
          return execute();
        }),
      ),
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
    controller.abort(new DOMException('AWS discovery execution has ended.', 'AbortError'));
    for (const client of execution.clients.values()) client.destroy();
    execution.clients.clear();
    execution.cache.clear();
  }
};

/**
 * Runs one physical request under a service wrapper's retry budget.
 *
 * @param execute - AWS SDK call whose retries are owned by its caller.
 * @returns The single-attempt response or error.
 */
export const runAwsServiceAttempt = <T>(execute: () => Promise<T>): Promise<T> =>
  serviceAttemptContext.run(true, execute);

/**
 * Configures retry ownership for an AWS client.
 *
 * @param key - Service and region identifying the client within a discovery run.
 * @param create - Constructs the service client with its normal SDK defaults.
 * @returns The configured client.
 */
export const getAwsClient = <T extends ManagedAwsClient>(key: string, create: () => T): T => {
  throwIfAwsExecutionAborted();
  const execution = executionContext.getStore();
  const cached = execution?.clients.get(key);
  if (cached) return cached as T;
  const client = create();
  const retryStrategy = client.config.retryStrategy;
  const maxAttempts = client.config.maxAttempts;
  client.config.retryStrategy = () =>
    serviceAttemptContext.getStore() ? Promise.resolve(singleAttemptStrategy) : retryStrategy();
  client.config.maxAttempts = () => (serviceAttemptContext.getStore() ? Promise.resolve(1) : maxAttempts());
  if (execution) {
    const handler = client.config.requestHandler;
    const handle = handler.handle.bind(handler);
    handler.handle = async (request, options) => {
      throwIfAwsExecutionAborted();
      execution.controller.signal.throwIfAborted();
      const startedAtMs = Date.now();
      try {
        const result = await handle(request, {
          ...options,
          abortSignal: options?.abortSignal ?? execution.controller.signal,
        });
        emitDebugLog(
          execution.debugLogger,
          `aws: transport ${key} returned HTTP ${result.response.statusCode} in ${Date.now() - startedAtMs}ms`,
        );
        return result;
      } catch (error) {
        emitDebugLog(execution.debugLogger, `aws: transport ${key} failed in ${Date.now() - startedAtMs}ms`);
        throw error;
      }
    };
    execution.clients.set(key, client);
  }
  return client;
};
