import {
  DescribeLogGroupsCommand,
  DescribeLogStreamsCommand,
  DescribeMetricFiltersCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import type {
  AwsCloudWatchLogGroup,
  AwsCloudWatchLogMetricFilterCoverage,
  AwsCloudWatchLogStream,
  AwsDiscoveredResource,
} from '@cloudburn/rules';
import { createCloudWatchLogsClient } from '../client.js';
import { withAwsServiceErrorContext } from './utils.js';

const CLOUDWATCH_LOG_GROUP_ARN_PATTERN = /^arn:[^:]+:logs:[^:]+:[^:]+:log-group:(.+)$/u;

const extractAccountIdFromArn = (arn: string): string | null => {
  const arnSegments = arn.split(':');
  return arnSegments[4] || null;
};

const extractLogGroupName = (arn: string): string | null => {
  const match = CLOUDWATCH_LOG_GROUP_ARN_PATTERN.exec(arn);

  if (!match?.[1]) {
    return null;
  }

  return match[1].replace(/:\*$/u, '');
};

/**
 * Hydrates discovered CloudWatch log groups with retention metadata.
 *
 * @param resources - Catalog resources filtered to CloudWatch Logs log groups.
 * @returns Hydrated log groups for rule evaluation.
 */
export const hydrateAwsCloudWatchLogGroups = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsCloudWatchLogGroup[]> => {
  const resourcesByRegion = new Map<string, AwsDiscoveredResource[]>();

  for (const resource of resources) {
    const logGroupName = extractLogGroupName(resource.arn);

    if (!logGroupName) {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push(resource);
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const logGroups: AwsCloudWatchLogGroup[] = [];
      const client = createCloudWatchLogsClient({ region });
      const desiredLogGroupNames = new Set(
        regionResources
          .map((resource) => extractLogGroupName(resource.arn))
          .filter((logGroupName): logGroupName is string => logGroupName !== null),
      );
      const remainingLogGroupNames = new Set(desiredLogGroupNames);
      let nextToken: string | undefined;

      do {
        const response = await withAwsServiceErrorContext('Amazon CloudWatch Logs', 'DescribeLogGroups', region, () =>
          client.send(new DescribeLogGroupsCommand({ nextToken })),
        );

        for (const logGroup of response.logGroups ?? []) {
          if (!logGroup.logGroupName || !logGroup.arn || !desiredLogGroupNames.has(logGroup.logGroupName)) {
            continue;
          }

          const accountId = extractAccountIdFromArn(logGroup.arn);

          if (!accountId) {
            continue;
          }

          logGroups.push({
            accountId,
            logGroupArn: logGroup.arn,
            logGroupClass: logGroup.logGroupClass,
            logGroupName: logGroup.logGroupName,
            region,
            retentionInDays: logGroup.retentionInDays,
            storedBytes: logGroup.storedBytes,
          });
          remainingLogGroupNames.delete(logGroup.logGroupName);
        }

        if (remainingLogGroupNames.size === 0) {
          break;
        }

        nextToken = response.nextToken;
      } while (nextToken);

      return logGroups;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.logGroupName.localeCompare(right.logGroupName));
};

/**
 * Hydrates discovered CloudWatch log streams by enumerating streams for each
 * discovered log group.
 *
 * @param resources - Catalog resources filtered to CloudWatch Logs log groups.
 * @returns Hydrated log streams for rule evaluation.
 */
export const hydrateAwsCloudWatchLogStreams = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsCloudWatchLogStream[]> => {
  const resourcesByRegion = new Map<string, AwsDiscoveredResource[]>();

  for (const resource of resources) {
    const logGroupName = extractLogGroupName(resource.arn);

    if (!logGroupName) {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push(resource);
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const logStreams: AwsCloudWatchLogStream[] = [];
      const client = createCloudWatchLogsClient({ region });
      const desiredLogGroupNames = [
        ...new Set(
          regionResources
            .map((resource) => extractLogGroupName(resource.arn))
            .filter((logGroupName): logGroupName is string => logGroupName !== null),
        ),
      ];

      for (const logGroupName of desiredLogGroupNames) {
        let nextToken: string | undefined;

        do {
          const response = await withAwsServiceErrorContext(
            'Amazon CloudWatch Logs',
            'DescribeLogStreams',
            region,
            () =>
              client.send(
                new DescribeLogStreamsCommand({
                  logGroupName,
                  nextToken,
                }),
              ),
          );

          for (const logStream of response.logStreams ?? []) {
            if (!logStream.logStreamName || !logStream.arn) {
              continue;
            }

            const accountId = extractAccountIdFromArn(logStream.arn);

            if (!accountId) {
              continue;
            }

            logStreams.push({
              accountId,
              arn: logStream.arn,
              creationTime: logStream.creationTime,
              firstEventTimestamp: logStream.firstEventTimestamp,
              lastEventTimestamp: logStream.lastEventTimestamp,
              lastIngestionTime: logStream.lastIngestionTime,
              logGroupName,
              logStreamName: logStream.logStreamName,
              region,
            });
          }

          nextToken = response.nextToken;
        } while (nextToken);
      }

      return logStreams;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.arn.localeCompare(right.arn));
};

/**
 * Hydrates discovered CloudWatch log groups with their metric-filter counts.
 *
 * @param resources - Catalog resources filtered to CloudWatch Logs log groups.
 * @returns Metric-filter coverage summaries keyed by log group.
 */
export const hydrateAwsCloudWatchLogMetricFilterCoverage = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsCloudWatchLogMetricFilterCoverage[]> => {
  const resourcesByRegion = new Map<string, AwsDiscoveredResource[]>();

  for (const resource of resources) {
    const logGroupName = extractLogGroupName(resource.arn);

    if (!logGroupName) {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push(resource);
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const client = createCloudWatchLogsClient({ region });
      const desiredLogGroups = new Map(
        regionResources.flatMap((resource) => {
          const logGroupName = extractLogGroupName(resource.arn);

          return logGroupName ? [[logGroupName, resource.accountId] as const] : [];
        }),
      );

      const coverage = await Promise.all(
        [...desiredLogGroups.entries()].map(async ([logGroupName, accountId]) => {
          let nextToken: string | undefined;
          let metricFilterCount = 0;

          do {
            const response = await withAwsServiceErrorContext(
              'Amazon CloudWatch Logs',
              'DescribeMetricFilters',
              region,
              () =>
                client.send(
                  new DescribeMetricFiltersCommand({
                    logGroupName,
                    nextToken,
                  }),
                ),
            );

            metricFilterCount += (response.metricFilters ?? []).length;
            nextToken = response.nextToken;
          } while (nextToken);

          return {
            accountId,
            logGroupName,
            metricFilterCount,
            region,
          } satisfies AwsCloudWatchLogMetricFilterCoverage;
        }),
      );

      return coverage;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.logGroupName.localeCompare(right.logGroupName));
};
