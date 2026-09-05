import { GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { createCloudWatchClient } from '../client.js';
import { chunkItems, mapWithConcurrency, withAwsServiceErrorContext } from './utils.js';

const CLOUDWATCH_METRIC_QUERY_BATCH_SIZE = 500;
const CLOUDWATCH_MAX_DATAPOINTS = 100_800;
const CLOUDWATCH_BATCH_CONCURRENCY = 2;

type MetricBatch = { queries: CloudWatchMetricQuery[]; startTime: Date; endTime: Date };

const createMetricBatches = (queries: CloudWatchMetricQuery[], startTime: Date, endTime: Date): MetricBatch[] => {
  const byPeriod = new Map<number, CloudWatchMetricQuery[]>();
  for (const query of queries) {
    if (!Number.isFinite(query.period) || query.period <= 0)
      throw new RangeError('CloudWatch metric periods must be positive.');
    const group = byPeriod.get(query.period) ?? [];
    group.push(query);
    byPeriod.set(query.period, group);
  }
  return [...byPeriod].flatMap(([period, group]) => {
    const periodMs = period * 1000;
    const start = new Date(Math.floor(startTime.getTime() / periodMs) * periodMs);
    const end = new Date(Math.floor(endTime.getTime() / periodMs) * periodMs);
    const pointsPerQuery = (end.getTime() - start.getTime()) / periodMs;
    if (pointsPerQuery <= 0) return [];
    const size = Math.max(
      1,
      Math.min(CLOUDWATCH_METRIC_QUERY_BATCH_SIZE, Math.floor(CLOUDWATCH_MAX_DATAPOINTS / pointsPerQuery)),
    );
    return chunkItems(group, size).map((batch) => ({ queries: batch, startTime: start, endTime: end }));
  });
};

/**
 * Declarative CloudWatch metric query definition used for batched
 * `GetMetricData` calls.
 */
export type CloudWatchMetricQuery = {
  id: string;
  namespace: string;
  metricName: string;
  dimensions: Array<{
    Name: string;
    Value: string;
  }>;
  period: number;
  stat: 'Average' | 'Maximum' | 'Sum';
};

/**
 * Normalized CloudWatch metric datapoint emitted for a queried signal.
 */
export type CloudWatchMetricPoint = {
  timestamp: string;
  value: number;
};

/**
 * Fetches CloudWatch metric data for a region and returns normalized data
 * points per query ID.
 *
 * @param region - AWS region for the metric query.
 * @param startTime - Inclusive metric window start time.
 * @param endTime - Exclusive metric window end time.
 * @param queries - Metric queries keyed by a stable caller-provided ID.
 * @returns Normalized metric points keyed by the original query ID.
 */
export const fetchCloudWatchSignals = async (options: {
  region: string;
  startTime: Date;
  endTime: Date;
  queries: CloudWatchMetricQuery[];
}): Promise<Map<string, CloudWatchMetricPoint[]>> => {
  const client = createCloudWatchClient({ region: options.region });
  const batches = createMetricBatches(options.queries, options.startTime, options.endTime);
  const batchResults = await mapWithConcurrency(batches, CLOUDWATCH_BATCH_CONCURRENCY, async (batch) => {
    const results = new Map<string, CloudWatchMetricPoint[]>();
    const finalStatuses = new Map<string, string>();
    let nextToken: string | undefined;

    do {
      const response = await withAwsServiceErrorContext('Amazon CloudWatch', 'GetMetricData', options.region, () =>
        client.send(
          new GetMetricDataCommand({
            EndTime: batch.endTime,
            MaxDatapoints: CLOUDWATCH_MAX_DATAPOINTS,
            MetricDataQueries: batch.queries.map((query) => ({
              Id: query.id,
              MetricStat: {
                Metric: {
                  Dimensions: query.dimensions,
                  MetricName: query.metricName,
                  Namespace: query.namespace,
                },
                Period: query.period,
                Stat: query.stat,
              },
              ReturnData: true,
            })),
            NextToken: nextToken,
            ScanBy: 'TimestampAscending',
            StartTime: batch.startTime,
          }),
        ),
      );

      for (const result of response.MetricDataResults ?? []) {
        if (!result.Id) {
          continue;
        }

        if (result.StatusCode) {
          finalStatuses.set(result.Id, result.StatusCode);
        }

        const points = results.get(result.Id) ?? [];
        const timestamps = result.Timestamps ?? [];
        const values = result.Values ?? [];

        for (let index = 0; index < Math.min(timestamps.length, values.length); index += 1) {
          const timestamp = timestamps[index];
          const value = values[index];

          if (!timestamp || !Number.isFinite(timestamp.getTime()) || value === undefined || !Number.isFinite(value)) {
            continue;
          }

          points.push({
            timestamp: timestamp.toISOString(),
            value,
          });
        }

        results.set(result.Id, points);
      }

      nextToken = response.NextToken;
    } while (nextToken);

    for (const [resultId, status] of finalStatuses) {
      if (status !== 'Complete') {
        results.delete(resultId);
      }
    }
    return results;
  });
  const results = new Map(batchResults.flatMap((batch) => [...batch]));
  return new Map(
    options.queries.flatMap((query) => {
      const points = results.get(query.id);
      return points ? [[query.id, points] as const] : [];
    }),
  );
};
