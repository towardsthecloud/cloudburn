import { GetMetricDataCommand, type MessageData } from '@aws-sdk/client-cloudwatch';
import { createCloudWatchClient } from '../client.js';
import { waitForAwsDelay } from '../execution.js';
import { fetchCachedCloudWatchSignals } from '../metric-cache.js';
import { chunkItems, mapWithConcurrency, withAwsServiceErrorContext } from './utils.js';

const CLOUDWATCH_METRIC_QUERY_BATCH_SIZE = 500;
const CLOUDWATCH_MAX_DATAPOINTS = 100_800;
const CLOUDWATCH_BATCH_CONCURRENCY = 2;
const CLOUDWATCH_QUERY_ATTEMPTS = 3;

/** Declarative metric query used in batched CloudWatch requests. */
export type CloudWatchMetricQuery = {
  id: string;
  namespace: string;
  metricName: string;
  dimensions: Array<{ Name: string; Value: string }>;
  period: number;
  stat: 'Average' | 'Maximum' | 'Sum' | 'SampleCount';
};

/** A finite metric value at an ISO timestamp within the observation window. */
export type CloudWatchMetricPoint = { timestamp: string; value: number };

/** Query evidence retained even when AWS cannot return a complete series. */
export type CloudWatchMetricEvidence = {
  status: 'Complete' | 'PartialData' | 'Forbidden' | 'InternalError' | 'Missing' | 'Unknown';
  points: CloudWatchMetricPoint[];
  window: { startTime: string; endTime: string; periodSeconds: number };
  coverage: { expectedPoints: number; observedPoints: number };
  messages: Array<{ code?: string; value?: string; scope: 'query' | 'request' }>;
  attempts: number;
};

/**
 * Selects the observation window independently of the metric aggregation period.
 *
 * @param options - End timestamp, lookback duration, and rolling or complete UTC day semantics.
 * @returns Inclusive start and exclusive end, aligned to minutes or UTC midnight respectively.
 */
export const cloudWatchWindow = (options: {
  endTime: Date;
  lookbackSeconds: number;
  mode: 'rolling' | 'complete-days';
}): { startTime: Date; endTime: Date } => {
  const resolutionMs = options.mode === 'complete-days' ? 86_400_000 : 60_000;
  const endTime = new Date(Math.floor(options.endTime.getTime() / resolutionMs) * resolutionMs);
  return { endTime, startTime: new Date(endTime.getTime() - options.lookbackSeconds * 1000) };
};

/**
 * Exposes points only when all requested data was returned; empty remains distinct from unknown.
 *
 * @param evidence - Evidence for one query, or an absent lookup.
 * @returns Complete points (possibly empty), or undefined for unknown or failed evidence.
 */
export const getCompleteCloudWatchPoints = (
  evidence: CloudWatchMetricEvidence | undefined,
): CloudWatchMetricPoint[] | undefined => (evidence?.status === 'Complete' ? evidence.points : undefined);

const createMetricBatches = (queries: CloudWatchMetricQuery[], startTime: Date, endTime: Date) => {
  if (!Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime()) || endTime <= startTime) {
    throw new RangeError('CloudWatch observation windows must have a finite start before the end.');
  }
  const byPeriod = new Map<number, CloudWatchMetricQuery[]>();
  const ids = new Set<string>();
  for (const query of queries) {
    if (!Number.isInteger(query.period) || query.period <= 0) {
      throw new RangeError('CloudWatch metric periods must be positive integers.');
    }
    if (ids.has(query.id)) throw new RangeError(`Duplicate CloudWatch query ID: ${query.id}`);
    ids.add(query.id);
    const group = byPeriod.get(query.period) ?? [];
    group.push(query);
    byPeriod.set(query.period, group);
  }
  return [...byPeriod].flatMap(([period, group]) => {
    const pointsPerQuery = Math.ceil((endTime.getTime() - startTime.getTime()) / (period * 1000));
    const size = Math.max(
      1,
      Math.min(CLOUDWATCH_METRIC_QUERY_BATCH_SIZE, Math.floor(CLOUDWATCH_MAX_DATAPOINTS / pointsPerQuery)),
    );
    return chunkItems(group, size);
  });
};

const appendMessages = (
  evidence: CloudWatchMetricEvidence,
  messages: MessageData[] | undefined,
  scope: 'query' | 'request',
): void => {
  for (const message of messages ?? []) {
    const normalized = { code: message.Code, value: message.Value, scope };
    if (
      !evidence.messages.some(
        (entry) => entry.code === normalized.code && entry.value === normalized.value && entry.scope === scope,
      )
    ) {
      evidence.messages.push(normalized);
    }
  }
};

/**
 * Retrieves every requested series without treating missing or failed queries as empty data.
 *
 * @param options - Region, explicit observation window, and queries with unique caller-owned IDs.
 * @returns One evidence record per query, with status, normalized points, coverage and AWS diagnostics.
 */
const fetchCloudWatchSignalsLive = async (options: {
  region: string;
  startTime: Date;
  endTime: Date;
  queries: CloudWatchMetricQuery[];
}): Promise<Map<string, CloudWatchMetricEvidence>> => {
  const batches = createMetricBatches(options.queries, options.startTime, options.endTime);
  const client = createCloudWatchClient({ region: options.region });
  const collect = async (queries: CloudWatchMetricQuery[], attempt: number) => {
    const results = new Map<string, CloudWatchMetricEvidence>(
      queries.map((query) => [
        query.id,
        {
          status: 'Missing',
          points: [],
          messages: [],
          attempts: attempt,
          window: {
            startTime: options.startTime.toISOString(),
            endTime: options.endTime.toISOString(),
            periodSeconds: query.period,
          },
          coverage: {
            expectedPoints: Math.ceil(
              (options.endTime.getTime() - options.startTime.getTime()) / (query.period * 1000),
            ),
            observedPoints: 0,
          },
        },
      ]),
    );
    const invalidSeries = new Set<string>();
    const seenTokens = new Set<string>();
    let nextToken: string | undefined;
    do {
      const response = await withAwsServiceErrorContext('Amazon CloudWatch', 'GetMetricData', options.region, () =>
        client.send(
          new GetMetricDataCommand({
            EndTime: options.endTime,
            MaxDatapoints: CLOUDWATCH_MAX_DATAPOINTS,
            MetricDataQueries: queries.map((query) => ({
              Id: query.id,
              MetricStat: {
                Metric: { Dimensions: query.dimensions, MetricName: query.metricName, Namespace: query.namespace },
                Period: query.period,
                Stat: query.stat,
              },
              ReturnData: true,
            })),
            NextToken: nextToken,
            ScanBy: 'TimestampAscending',
            StartTime: options.startTime,
          }),
        ),
      );
      for (const evidence of results.values()) appendMessages(evidence, response.Messages, 'request');
      for (const result of response.MetricDataResults ?? []) {
        const evidence = result.Id ? results.get(result.Id) : undefined;
        if (!evidence || !result.Id) continue;
        if (evidence.status !== 'Forbidden') evidence.status = result.StatusCode ?? 'Unknown';
        appendMessages(evidence, result.Messages, 'query');
        const timestamps = result.Timestamps ?? [];
        const values = result.Values ?? [];
        if (timestamps.length !== values.length) invalidSeries.add(result.Id);
        for (let index = 0; index < Math.min(timestamps.length, values.length); index += 1) {
          const timestamp = timestamps[index];
          const value = values[index];
          if (!timestamp || !Number.isFinite(timestamp.getTime()) || value === undefined || !Number.isFinite(value)) {
            invalidSeries.add(result.Id);
            continue;
          }
          if (timestamp < options.startTime || timestamp >= options.endTime) continue;
          evidence.points.push({ timestamp: timestamp.toISOString(), value });
        }
      }
      nextToken = response.NextToken;
      if (nextToken && seenTokens.has(nextToken)) {
        for (const evidence of results.values()) {
          appendMessages(
            evidence,
            [{ Code: 'PaginationDidNotAdvance', Value: 'CloudWatch repeated a pagination token.' }],
            'request',
          );
        }
        break;
      }
      if (nextToken) seenTokens.add(nextToken);
    } while (nextToken);
    for (const [id, evidence] of results) {
      const byBucket = new Map<number, CloudWatchMetricPoint>();
      for (const point of evidence.points) {
        const bucket = Math.floor(
          (Date.parse(point.timestamp) - options.startTime.getTime()) / (evidence.window.periodSeconds * 1000),
        );
        const previous = byBucket.get(bucket);
        if (previous && (previous.value !== point.value || previous.timestamp !== point.timestamp)) {
          invalidSeries.add(id);
        }
        // Never replace observed activity with a conflicting lower value.
        if (!previous || point.value > previous.value) byBucket.set(bucket, point);
      }
      evidence.points = [...byBucket.values()].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
      evidence.coverage.observedPoints = byBucket.size;
      if (invalidSeries.has(id))
        appendMessages(
          evidence,
          [
            {
              Code: 'InvalidDatapoints',
              Value: 'Metric timestamps and values were malformed or conflicted within an aggregation interval.',
            },
          ],
          'query',
        );
      if (invalidSeries.has(id) && evidence.status === 'Complete') evidence.status = 'PartialData';
    }
    return results;
  };
  const batchResults = await mapWithConcurrency(batches, CLOUDWATCH_BATCH_CONCURRENCY, async (queries) => {
    const results = await collect(queries, 1);
    for (let attempt = 2; attempt <= CLOUDWATCH_QUERY_ATTEMPTS; attempt += 1) {
      const pending = queries.filter((query) => {
        const status = results.get(query.id)?.status;
        return status === 'InternalError' || status === 'PartialData';
      });
      if (pending.length === 0) break;
      await waitForAwsDelay(100 * 2 ** (attempt - 2));
      const retried = await collect(pending, attempt);
      for (const [id, evidence] of retried) {
        const previous = results.get(id);
        evidence.messages = [
          ...new Map(
            [...(previous?.messages ?? []), ...evidence.messages].map((message) => [JSON.stringify(message), message]),
          ).values(),
        ];
        results.set(id, evidence);
      }
    }
    return results;
  });
  const results = new Map(batchResults.flatMap((batch) => [...batch]));
  return new Map(
    options.queries.map((query) => {
      const evidence = results.get(query.id);
      if (!evidence) throw new Error(`CloudWatch evidence missing for requested query ${query.id}.`);
      return [query.id, evidence];
    }),
  );
};

/**
 * Retrieves exact-window metric evidence with scoped incremental reuse and bounded query planning.
 * @param options - Region, observation window, and queries with unique caller-owned IDs.
 * @returns One complete or explicitly incomplete evidence record per requested query.
 */
export const fetchCloudWatchSignals = async (options: {
  region: string;
  startTime: Date;
  endTime: Date;
  queries: CloudWatchMetricQuery[];
}): Promise<Map<string, CloudWatchMetricEvidence>> => {
  const batches = createMetricBatches(options.queries, options.startTime, options.endTime);
  return fetchCachedCloudWatchSignals(options, fetchCloudWatchSignalsLive, batches.length);
};
