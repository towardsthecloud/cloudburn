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

/** Hooks that admit one AWS attempt and observe its physical transport. */
export type AwsServiceAttemptOptions = {
  /** Inspects command input before AWS serialization. */
  beforeRequest?: (input: unknown) => Promise<void>;
  /** Confirms admission after request preparation, immediately before physical dispatch. */
  beforeTransport?: () => Promise<void>;
  /** Marks physical dispatch after admission and the final cancellation checks. */
  onDispatch?: () => void;
  /** Reports handler time, excluding request preparation and admission waits. */
  onTransport?: (details: { durationMs: number; statusCode?: number }) => void;
};

const serviceAttemptContext = new AsyncLocalStorage<AwsServiceAttemptOptions>();
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

type AwsInitializeMiddleware = <Input extends object, Output>(
  next: (args: { input: Input }) => Promise<Output>,
) => (args: { input: Input }) => Promise<Output>;

type ManagedAwsClient = {
  config: {
    maxAttempts: () => Promise<number>;
    retryStrategy: () => Promise<RetryStrategy | RetryStrategyV2>;
    requestHandler: RequestHandler<HttpRequest, HttpResponse, HttpHandlerOptions>;
  };
  middlewareStack?: {
    add: (middleware: AwsInitializeMiddleware, options: { step: 'initialize'; name: string }) => void;
  };
  destroy: () => void;
};

type AwsExecution = {
  clients: Map<string, ManagedAwsClient>;
  cache: Map<string, Promise<unknown>>;
  controller: AbortController;
  debugLogger?: (message: string) => void;
  startedAtMs: number;
  observationTimestamp: number;
  deadlineMs: number;
};
const executionContext = new AsyncLocalStorage<AwsExecution>();
const DEFAULT_DISCOVERY_TIMEOUT_MS = 300_000;

/**
 * Starts bounded cleanup without retaining discovery caches, clients, or attempt callbacks.
 *
 * @param execute - Cleanup work that supplies its own cancellation and deadline.
 * @returns The cleanup result outside the discovery and attempt contexts.
 */
export const runOutsideAwsExecution = <T>(execute: () => T): T =>
  executionContext.exit(() => serviceAttemptContext.exit(execute));

/**
 * Emits sanitized request telemetry without allowing diagnostics to interrupt request cleanup.
 *
 * @param event - Structured attempt metadata that excludes command input and response payloads.
 * @returns Nothing.
 */
export const emitAwsRequestTelemetry = (event: Record<string, unknown>): void => {
  try {
    emitDebugLog(executionContext.getStore()?.debugLogger, `aws: attempt ${JSON.stringify(event)}`);
  } catch {
    // Request cleanup must still run when a caller's debug logger fails.
  }
};

/** Returns the active discovery cancellation signal, when a run is in progress. */
export const getAwsExecutionSignal = (): AbortSignal | undefined => executionContext.getStore()?.controller.signal;

/**
 * Returns the deadline that bounds the active discovery execution and its request leases.
 *
 * @returns The deadline as a Unix timestamp in milliseconds, or undefined outside discovery.
 */
export const getAwsExecutionDeadline = (): number | undefined => executionContext.getStore()?.deadlineMs;

/** Returns a stable timestamp for all observation windows in one discovery run. */
export const getAwsDiscoveryTimestamp = (): number => executionContext.getStore()?.observationTimestamp ?? Date.now();

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
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    observationTimestamp?: number;
    debugLogger?: (message: string) => void;
  },
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
    observationTimestamp: options.observationTimestamp ?? startedAtMs,
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
 * @param options - Optional admission and transport hooks for this attempt.
 * @returns The single-attempt response or error.
 */
export const runAwsServiceAttempt = <T>(
  execute: () => Promise<T>,
  options: AwsServiceAttemptOptions = {},
): Promise<T> => serviceAttemptContext.run(options, execute);

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
  client.middlewareStack?.add(
    (next) => async (args) => {
      throwIfAwsExecutionAborted();
      await serviceAttemptContext.getStore()?.beforeRequest?.(args.input);
      throwIfAwsExecutionAborted();
      return next(args);
    },
    { step: 'initialize', name: 'cloudburnAwsAttemptAdmission' },
  );
  const handler = client.config.requestHandler;
  if (handler) {
    const handle = handler.handle.bind(handler);
    handler.handle = async (request, options) => {
      throwIfAwsExecutionAborted();
      const requestExecution = execution ?? executionContext.getStore();
      requestExecution?.controller.signal.throwIfAborted();
      const attempt = serviceAttemptContext.getStore();
      await attempt?.beforeTransport?.();
      throwIfAwsExecutionAborted();
      requestExecution?.controller.signal.throwIfAborted();
      attempt?.onDispatch?.();
      const startedAtMs = Date.now();
      let statusCode: number | undefined;
      try {
        const result = await handle(request, {
          ...options,
          abortSignal: options?.abortSignal ?? requestExecution?.controller.signal,
        });
        statusCode = result.response.statusCode;
        return result;
      } finally {
        const durationMs = Date.now() - startedAtMs;
        attempt?.onTransport?.(statusCode === undefined ? { durationMs } : { durationMs, statusCode });
        if (requestExecution) {
          emitDebugLog(
            requestExecution.debugLogger,
            statusCode === undefined
              ? `aws: transport ${key} failed in ${durationMs}ms`
              : `aws: transport ${key} returned HTTP ${statusCode} in ${durationMs}ms`,
          );
        }
      }
    };
  }
  if (execution) execution.clients.set(key, client);
  return client;
};
