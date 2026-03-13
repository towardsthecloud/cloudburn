import { GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { createCloudWatchClient } from '../client.js';
import { chunkItems, withAwsServiceErrorContext } from './utils.js';

const CLOUDWATCH_METRIC_QUERY_BATCH_SIZE = 100;

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
  const results = new Map<string, CloudWatchMetricPoint[]>();

  for (const batch of chunkItems(options.queries, CLOUDWATCH_METRIC_QUERY_BATCH_SIZE)) {
    let nextToken: string | undefined;

    do {
      const response = await withAwsServiceErrorContext('Amazon CloudWatch', 'GetMetricData', options.region, () =>
        client.send(
          new GetMetricDataCommand({
            EndTime: options.endTime,
            MetricDataQueries: batch.map((query) => ({
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
            StartTime: options.startTime,
          }),
        ),
      );

      for (const result of response.MetricDataResults ?? []) {
        if (!result.Id) {
          continue;
        }

        const points = results.get(result.Id) ?? [];
        const timestamps = result.Timestamps ?? [];
        const values = result.Values ?? [];

        for (let index = 0; index < Math.min(timestamps.length, values.length); index += 1) {
          const timestamp = timestamps[index];
          const value = values[index];

          if (!timestamp || value === undefined) {
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
  }

  return results;
};
