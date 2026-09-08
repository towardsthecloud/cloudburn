import { AsyncLocalStorage } from 'node:async_hooks';
import {
  awaitAwsExecution,
  getAwsDiscoveryTimestamp,
  getAwsExecutionDeadline,
  getAwsExecutionDebugLogger,
  getAwsExecutionSignal,
  runOutsideAwsExecution,
  throwIfAwsExecutionAborted,
  withAwsDiscoveryExecution,
} from './execution.js';
import type { CloudWatchMetricEvidence, CloudWatchMetricQuery } from './resources/cloudwatch.js';

const MAX_RETAINED_QUERIES = 8192;
const MAX_ACTIVE_REQUESTS = 2;
const FLUSH_DELAY_MS = 5;

type MetricRequest = {
  region: string;
  startTime: Date;
  endTime: Date;
  queries: CloudWatchMetricQuery[];
};
type MetricFetch = (request: MetricRequest) => Promise<Map<string, CloudWatchMetricEvidence>>;
type Waiter = {
  request: MetricRequest;
  fetch: MetricFetch;
  resolve: (result: Map<string, CloudWatchMetricEvidence>) => void;
  reject: (error: unknown) => void;
  results: Map<string, CloudWatchMetricEvidence>;
  active: boolean;
  observationTimestamp: number;
  deadline?: number;
  debugLogger?: (message: string) => void;
  onSettled: Set<() => void>;
  runInContext: <T>(run: () => T) => T;
};
type Consumer = { waiter: Waiter; query: CloudWatchMetricQuery };
type Segment = { start: number; end: number; query: CloudWatchMetricQuery; consumers: Consumer[] };
type Planner = {
  pending: Waiter[];
  queued: Segment[][];
  active: number;
  retainedQueries: number;
  capacity: ReturnType<typeof createCapacityNotification>;
  capacityScheduled: boolean;
  timer?: ReturnType<typeof setTimeout>;
};
const context = new AsyncLocalStorage<Planner>();

const createCapacityNotification = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve = () => {};
  const promise = new Promise<void>((notify) => {
    resolve = notify;
  });
  return { promise, resolve };
};

const metricIdentity = (query: CloudWatchMetricQuery, start: number, end: number): string =>
  JSON.stringify([
    query.namespace,
    query.metricName,
    [...query.dimensions].sort(
      (left, right) => left.Name.localeCompare(right.Name) || left.Value.localeCompare(right.Value),
    ),
    query.period,
    query.stat,
    start % (query.period * 1000),
    // A partial final period must retain its exact aggregation window.
    (end - start) % (query.period * 1000) === 0 ? null : [start, end],
  ]);

const sliceEvidence = (evidence: CloudWatchMetricEvidence, consumer: Consumer): CloudWatchMetricEvidence => {
  const { request } = consumer.waiter;
  const start = +request.startTime;
  const end = +request.endTime;
  const points = evidence.points.filter(
    (point) => Date.parse(point.timestamp) >= start && Date.parse(point.timestamp) < end,
  );
  return {
    ...evidence,
    points,
    messages: evidence.messages.map((message) => ({ ...message })),
    window: {
      startTime: request.startTime.toISOString(),
      endTime: request.endTime.toISOString(),
      periodSeconds: consumer.query.period,
    },
    coverage: {
      expectedPoints: Math.ceil((end - start) / (consumer.query.period * 1000)),
      observedPoints: new Set(
        points.map((point) => Math.floor((Date.parse(point.timestamp) - start) / (consumer.query.period * 1000))),
      ).size,
    },
  };
};

// Merge only the union of requested intervals, then batch metrics sharing that exact union.
const planWindows = (consumers: Consumer[]): Segment[][] => {
  const metrics = new Map<string, Segment[]>();
  for (const consumer of consumers) {
    if (!consumer.waiter.active) continue;
    const { query, waiter } = consumer;
    const start = +waiter.request.startTime;
    const key = metricIdentity(query, start, +waiter.request.endTime);
    const segments = metrics.get(key) ?? [];
    segments.push({ start, end: +waiter.request.endTime, query, consumers: [consumer] });
    metrics.set(key, segments);
  }
  const windows = new Map<string, Segment[]>();
  for (const segments of metrics.values()) {
    const merged: Segment[] = [];
    for (const segment of segments.sort((left, right) => left.start - right.start)) {
      const previous = merged.at(-1);
      if (previous && segment.start <= previous.end) {
        previous.end = Math.max(previous.end, segment.end);
        previous.consumers.push(...segment.consumers);
      } else merged.push(segment);
    }
    for (const segment of merged) {
      const key = `${segment.start}:${segment.end}`;
      const window = windows.get(key) ?? [];
      window.push(segment);
      windows.set(key, window);
    }
  }
  return [...windows.values()];
};

const executeWindow = async (segments: Segment[]): Promise<void> => {
  const firstSegment = segments[0];
  const first = firstSegment?.consumers[0]?.waiter;
  if (!firstSegment || !first) return;
  const consumers = segments.flatMap((segment) => segment.consumers);
  const deadline = Math.max(...consumers.map((consumer) => consumer.waiter.deadline ?? Date.now() + 300_000));
  const controller = new AbortController();
  const activeWaiters = new Set(consumers.map((consumer) => consumer.waiter));
  const notifications = new Map(
    [...activeWaiters].map((waiter) => [
      waiter,
      () => {
        activeWaiters.delete(waiter);
        if (activeWaiters.size === 0) controller.abort(new DOMException('All metric waiters cancelled.', 'AbortError'));
      },
    ]),
  );
  for (const [waiter, notification] of notifications) waiter.onSettled.add(notification);
  try {
    // Preserve the originating credentials and request budget, with independent transport ownership.
    const results = await first.runInContext(() =>
      runOutsideAwsExecution(() =>
        withAwsDiscoveryExecution(
          {
            signal: controller.signal,
            observationTimestamp: first.observationTimestamp,
            debugLogger: first.debugLogger,
            timeoutMs: Math.max(1, Math.min(2_147_483_647, deadline - Date.now())),
          },
          () =>
            first.fetch({
              region: first.request.region,
              startTime: new Date(firstSegment.start),
              endTime: new Date(firstSegment.end),
              queries: segments.map((segment, index) => ({ ...segment.query, id: `m${index}` })),
            }),
        ),
      ),
    );
    segments.forEach((segment, index) => {
      const evidence = results.get(`m${index}`);
      if (!evidence) throw new Error(`CloudWatch evidence missing for requested query m${index}.`);
      for (const consumer of segment.consumers) {
        if (!consumer.waiter.active) continue;
        consumer.waiter.results.set(consumer.query.id, sliceEvidence(evidence, consumer));
        if (consumer.waiter.results.size === consumer.waiter.request.queries.length) {
          consumer.waiter.resolve(
            new Map(
              consumer.waiter.request.queries.map((query) => [
                query.id,
                consumer.waiter.results.get(query.id) as CloudWatchMetricEvidence,
              ]),
            ),
          );
        }
      }
    });
  } catch (error) {
    for (const consumer of consumers) consumer.waiter.reject(error);
  } finally {
    for (const [waiter, notification] of notifications) waiter.onSettled.delete(notification);
  }
};

const pump = (planner: Planner): void => {
  while (planner.active < MAX_ACTIVE_REQUESTS && planner.queued.length > 0) {
    const queued = planner.queued.shift();
    if (!queued) break;
    // A cancelled waiter may have been the bridge joining two otherwise separate intervals.
    const [segments, ...remaining] = planWindows(queued.flatMap((segment) => segment.consumers));
    planner.queued.unshift(...remaining);
    if (!segments) continue;
    planner.active += 1;
    void executeWindow(segments).finally(() => {
      planner.active -= 1;
      pump(planner);
    });
  }
};

const flush = (planner: Planner): void => {
  planner.timer = undefined;
  const pending = planner.pending.splice(0);
  while (pending.length > 0) {
    const first = pending.shift();
    if (!first) break;
    const waiters = [first];
    for (let index = 0; index < pending.length; ) {
      const other = pending[index];
      if (other && other.fetch === first.fetch && other.request.region === first.request.region) {
        waiters.push(other);
        pending.splice(index, 1);
      } else index += 1;
    }
    planner.queued.push(
      ...planWindows(waiters.flatMap((waiter) => waiter.request.queries.map((query) => ({ waiter, query })))),
    );
  }
  pump(planner);
};

/**
 * Collects metric requests within a scan with a 5 ms flush delay, two active requests and at most 8192 retained queries.
 * Shared cache loaders can outlive the scan; their own waiter signals control planner cleanup.
 * @param run - Scan whose concurrent metric lookups may share requests.
 * @returns The scan result.
 */
export const withCloudWatchMetricPlanning = <T>(run: () => Promise<T>): Promise<T> =>
  context.run(
    {
      pending: [],
      queued: [],
      active: 0,
      retainedQueries: 0,
      capacity: createCapacityNotification(),
      capacityScheduled: false,
    },
    run,
  );

/**
 * Plans metric requests while preserving each caller's query identities and requested intervals.
 * @param request - Region, observation window and caller-owned metric queries.
 * @param fetch - Stable transport function that owns AWS batching, pagination and retries.
 * @returns Evidence for each requested query, waiting for capacity and splitting inputs larger than 8192 queries.
 */
export const planCloudWatchSignals = async (
  request: MetricRequest,
  fetch: MetricFetch,
): Promise<Map<string, CloudWatchMetricEvidence>> => {
  const planner = context.getStore();
  if (!planner) return fetch(request);
  if (
    !Number.isFinite(+request.startTime) ||
    !Number.isFinite(+request.endTime) ||
    request.endTime <= request.startTime
  ) {
    return Promise.reject(new RangeError('CloudWatch observation windows must have a finite start before the end.'));
  }
  const ids = new Set<string>();
  for (const query of request.queries) {
    if (!Number.isInteger(query.period) || query.period <= 0)
      return Promise.reject(new RangeError('CloudWatch metric periods must be positive integers.'));
    if (ids.has(query.id)) return Promise.reject(new RangeError(`Duplicate CloudWatch query ID: ${query.id}`));
    ids.add(query.id);
  }
  if (request.queries.length === 0) return Promise.resolve(new Map());
  if (request.queries.length > MAX_RETAINED_QUERIES) {
    const results = new Map<string, CloudWatchMetricEvidence>();
    for (let index = 0; index < request.queries.length; index += MAX_RETAINED_QUERIES) {
      const batch = await planCloudWatchSignals(
        { ...request, queries: request.queries.slice(index, index + MAX_RETAINED_QUERIES) },
        fetch,
      );
      for (const [id, evidence] of batch) results.set(id, evidence);
    }
    return results;
  }
  while (planner.retainedQueries + request.queries.length > MAX_RETAINED_QUERIES) {
    // Admission waits share one capacity notification rather than retaining a separate planner queue.
    await awaitAwsExecution(planner.capacity.promise);
  }
  throwIfAwsExecutionAborted();
  return new Promise((resolve, reject) => {
    const signal = getAwsExecutionSignal();
    planner.retainedQueries += request.queries.length;
    const settle = () => {
      if (!waiter.active) return false;
      waiter.active = false;
      planner.retainedQueries -= request.queries.length;
      if (!planner.capacityScheduled) {
        planner.capacityScheduled = true;
        queueMicrotask(() => {
          planner.capacityScheduled = false;
          const previous = planner.capacity;
          planner.capacity = createCapacityNotification();
          previous.resolve();
        });
      }
      signal?.removeEventListener('abort', onAbort);
      const index = planner.pending.indexOf(waiter);
      if (index >= 0) planner.pending.splice(index, 1);
      planner.queued = planner.queued
        .map((segments) =>
          segments
            .map((segment) => ({
              ...segment,
              consumers: segment.consumers.filter((consumer) => consumer.waiter.active),
            }))
            .filter((segment) => segment.consumers.length > 0),
        )
        .filter((segments) => segments.length > 0);
      if (planner.pending.length === 0) {
        clearTimeout(planner.timer);
        planner.timer = undefined;
      }
      for (const notify of waiter.onSettled) notify();
      return true;
    };
    const waiter: Waiter = {
      request,
      fetch,
      results: new Map(),
      active: true,
      onSettled: new Set(),
      runInContext: AsyncLocalStorage.snapshot(),
      observationTimestamp: getAwsDiscoveryTimestamp(),
      deadline: getAwsExecutionDeadline(),
      debugLogger: getAwsExecutionDebugLogger(),
      resolve: (result) => {
        if (settle()) resolve(result);
      },
      reject: (error) => {
        if (settle()) reject(error);
      },
    };
    const onAbort = () => waiter.reject(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    planner.pending.push(waiter);
    planner.timer ??= setTimeout(() => flush(planner), FLUSH_DELAY_MS);
  });
};
