import { DescribeScalableTargetsCommand } from '@aws-sdk/client-application-auto-scaling';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import type {
  AwsDiscoveredResource,
  AwsDynamoDbAutoscaling,
  AwsDynamoDbTable,
  AwsDynamoDbTableUtilization,
} from '@cloudburn/rules';
import type { ScanDiagnostic } from '../../../types.js';
import { createApplicationAutoScalingClient, createDynamoDbClient } from '../client.js';
import type { AwsDiscoveryDatasetLoadResult, AwsDiscoveryDatasetResolver } from '../discovery-registry.js';
import { formatAwsAccessDeniedReason, getAwsErrorCode, isAwsAccessDeniedError } from '../errors.js';
import { getAwsDiscoveryTimestamp } from '../execution.js';
import { fetchCloudWatchSignals } from './cloudwatch.js';
import { chunkItems, extractTerminalArnResourceIdentifier, withAwsServiceErrorContext } from './utils.js';

const DYNAMODB_TABLE_CONCURRENCY = 10;
const APPLICATION_AUTO_SCALING_BATCH_SIZE = 50;
const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;
const NINETY_DAYS_IN_SECONDS = 90 * 24 * 60 * 60;
const DAILY_PERIOD_IN_SECONDS = 24 * 60 * 60;
const REQUIRED_DYNAMODB_DAILY_POINTS = THIRTY_DAYS_IN_SECONDS / DAILY_PERIOD_IN_SECONDS;

type ParsedDynamoDbTable = {
  tableArn: string;
  tableName: string;
};

const parseDynamoDbTableArn = (arn: string): ParsedDynamoDbTable | null => {
  const tableName = extractTerminalArnResourceIdentifier(arn);

  return tableName
    ? {
        tableArn: arn,
        tableName,
      }
    : null;
};

/**
 * Hydrates discovered DynamoDB tables with billing-mode and stream-label metadata.
 *
 * @param resources - Catalog resources filtered to DynamoDB tables.
 * @returns Hydrated DynamoDB tables for rule evaluation.
 */
export const hydrateAwsDynamoDbTables = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsDynamoDbTable[] | AwsDiscoveryDatasetLoadResult<'aws-dynamodb-tables'>> => {
  const tablesByRegion = new Map<string, Array<{ accountId: string } & ParsedDynamoDbTable>>();

  for (const resource of resources) {
    const parsed = parseDynamoDbTableArn(resource.arn);

    if (!parsed) {
      continue;
    }

    const regionTables = tablesByRegion.get(resource.region) ?? [];
    regionTables.push({
      accountId: resource.accountId,
      ...parsed,
    });
    tablesByRegion.set(resource.region, regionTables);
  }

  const hydratedPages = await Promise.all(
    [...tablesByRegion.entries()].map(async ([region, regionTables]) => {
      const client = createDynamoDbClient({ region });
      const tables: AwsDynamoDbTable[] = [];
      const diagnostics: ScanDiagnostic[] = [];
      let firstAccessDeniedError: unknown;

      for (const batch of chunkItems(regionTables, DYNAMODB_TABLE_CONCURRENCY)) {
        const hydratedBatch = await Promise.all(
          batch.map(async (table) => {
            try {
              const response = await withAwsServiceErrorContext('Amazon DynamoDB', 'DescribeTable', region, () =>
                client.send(
                  new DescribeTableCommand({
                    TableName: table.tableName,
                  }),
                ),
              );
              const describedTable = response.Table;

              return {
                resource: {
                  accountId: table.accountId,
                  billingMode:
                    describedTable?.BillingModeSummary?.BillingMode ??
                    (describedTable?.ProvisionedThroughput ? 'PROVISIONED' : undefined),
                  creationDateTime: describedTable?.CreationDateTime?.toISOString(),
                  latestStreamLabel: describedTable?.LatestStreamLabel,
                  region,
                  tableArn: describedTable?.TableArn ?? table.tableArn,
                  tableName: describedTable?.TableName ?? table.tableName,
                  tableStatus: describedTable?.TableStatus,
                } satisfies AwsDynamoDbTable,
              };
            } catch (err) {
              if (!isAwsAccessDeniedError(err)) {
                throw err;
              }

              firstAccessDeniedError ??= err;

              return {
                diagnostic: {
                  code: getAwsErrorCode(err),
                  details: err instanceof Error ? err.message : String(err),
                  message: `Skipped DynamoDB table ${table.tableName} in ${region} because access is denied by ${formatAwsAccessDeniedReason(err)}.`,
                  provider: 'aws',
                  region,
                  service: 'dynamodb',
                  source: 'discovery',
                  status: 'access_denied',
                } satisfies ScanDiagnostic,
              };
            }
          }),
        );

        for (const result of hydratedBatch) {
          if (result.resource) {
            tables.push(result.resource);
          } else if (result.diagnostic) {
            diagnostics.push(result.diagnostic);
          }
        }
      }

      return { diagnostics, firstAccessDeniedError, tables };
    }),
  );

  const hydratedTables = hydratedPages
    .flatMap((page) => page.tables)
    .sort((left, right) => left.tableArn.localeCompare(right.tableArn));
  const diagnostics = hydratedPages.flatMap((page) => page.diagnostics);

  if (hydratedTables.length === 0) {
    const firstAccessDeniedError = hydratedPages.find((page) => page.firstAccessDeniedError)?.firstAccessDeniedError;
    if (firstAccessDeniedError) {
      throw firstAccessDeniedError;
    }
  }

  return diagnostics.length > 0 ? { diagnostics, resources: hydratedTables } : hydratedTables;
};

/**
 * Hydrates discovered DynamoDB tables with table-level autoscaling targets.
 *
 * @param resources - Catalog resources filtered to DynamoDB tables.
 * @returns Table-level autoscaling coverage for DynamoDB tables.
 */
export const hydrateAwsDynamoDbAutoscaling = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsDynamoDbAutoscaling[]> => {
  const tablesByRegion = new Map<string, Array<{ accountId: string } & ParsedDynamoDbTable>>();

  for (const resource of resources) {
    const parsed = parseDynamoDbTableArn(resource.arn);

    if (!parsed) {
      continue;
    }

    const regionTables = tablesByRegion.get(resource.region) ?? [];
    regionTables.push({
      accountId: resource.accountId,
      ...parsed,
    });
    tablesByRegion.set(resource.region, regionTables);
  }

  const hydratedPages = await Promise.all(
    [...tablesByRegion.entries()].map(async ([region, regionTables]) => {
      const client = createApplicationAutoScalingClient({ region });
      const readTargets = new Set<string>();
      const writeTargets = new Set<string>();

      for (const batch of chunkItems(regionTables, APPLICATION_AUTO_SCALING_BATCH_SIZE)) {
        let nextToken: string | undefined;

        do {
          const response = await withAwsServiceErrorContext(
            'AWS Application Auto Scaling',
            'DescribeScalableTargets',
            region,
            () =>
              client.send(
                new DescribeScalableTargetsCommand({
                  NextToken: nextToken,
                  ResourceIds: batch.map((table) => `table/${table.tableName}`),
                  ServiceNamespace: 'dynamodb',
                }),
              ),
          );

          for (const scalableTarget of response.ScalableTargets ?? []) {
            if (!scalableTarget.ResourceId) {
              continue;
            }

            if (scalableTarget.ScalableDimension === 'dynamodb:table:ReadCapacityUnits') {
              readTargets.add(scalableTarget.ResourceId);
            }

            if (scalableTarget.ScalableDimension === 'dynamodb:table:WriteCapacityUnits') {
              writeTargets.add(scalableTarget.ResourceId);
            }
          }

          nextToken = response.NextToken;
        } while (nextToken);
      }

      return regionTables.map((table) => {
        const resourceId = `table/${table.tableName}`;

        return {
          accountId: table.accountId,
          hasReadTarget: readTargets.has(resourceId),
          hasWriteTarget: writeTargets.has(resourceId),
          region,
          tableArn: table.tableArn,
          tableName: table.tableName,
        } satisfies AwsDynamoDbAutoscaling;
      });
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.tableArn.localeCompare(right.tableArn));
};

/**
 * Hydrates discovered DynamoDB tables with 30-day consumed read/write capacity summaries.
 *
 * @param resources - Catalog resources filtered to DynamoDB tables.
 * @returns Table utilization summaries for rule evaluation.
 */
export const hydrateAwsDynamoDbTableUtilization = async (
  resources: AwsDiscoveredResource[],
  context?: AwsDiscoveryDatasetResolver,
): Promise<AwsDynamoDbTableUtilization[]> => {
  const tableLoad = context
    ? await context.loadDataset('aws-dynamodb-tables')
    : await hydrateAwsDynamoDbTables(resources);
  const loadedTables = Array.isArray(tableLoad) ? tableLoad : tableLoad.resources;
  const selectedTableArns = new Set(resources.map((resource) => resource.arn));
  const tables = context ? loadedTables.filter((table) => selectedTableArns.has(table.tableArn)) : loadedTables;
  const tablesByRegion = new Map<string, typeof tables>();

  for (const table of tables) {
    const regionTables = tablesByRegion.get(table.region) ?? [];
    regionTables.push(table);
    tablesByRegion.set(table.region, regionTables);
  }

  const hydratedPages = await Promise.all(
    [...tablesByRegion.entries()].map(async ([region, regionTables]) => {
      const endTime = new Date(getAwsDiscoveryTimestamp());
      const ninetyDayStartTime = new Date(endTime.getTime() - NINETY_DAYS_IN_SECONDS * 1000);
      const thirtyDayStartTime = new Date(endTime.getTime() - THIRTY_DAYS_IN_SECONDS * 1000);
      const thirtyDayStartBucketMs =
        Math.floor(thirtyDayStartTime.getTime() / (DAILY_PERIOD_IN_SECONDS * 1000)) * DAILY_PERIOD_IN_SECONDS * 1000;
      const [readMetricData, writeMetricData] = await Promise.all([
        fetchCloudWatchSignals({
          endTime,
          queries: regionTables.map((table, index) => ({
            dimensions: [{ Name: 'TableName', Value: table.tableName }],
            id: `read${index}`,
            metricName: 'ConsumedReadCapacityUnits',
            namespace: 'AWS/DynamoDB',
            period: DAILY_PERIOD_IN_SECONDS,
            stat: 'Sum' as const,
          })),
          region,
          startTime: thirtyDayStartTime,
        }),
        fetchCloudWatchSignals({
          endTime,
          queries: regionTables.map((table, index) => ({
            dimensions: [{ Name: 'TableName', Value: table.tableName }],
            id: `write${index}`,
            metricName: 'ConsumedWriteCapacityUnits',
            namespace: 'AWS/DynamoDB',
            period: DAILY_PERIOD_IN_SECONDS,
            stat: 'Sum' as const,
          })),
          region,
          startTime: ninetyDayStartTime,
        }),
      ]);

      return regionTables.map((table, index) => {
        const readMetricId = `read${index}`;
        const writeMetricId = `write${index}`;
        const readPoints = readMetricData.get(readMetricId) ?? [];
        const writePoints = writeMetricData.get(writeMetricId) ?? [];
        const recentWritePoints = writePoints.filter((point) => Date.parse(point.timestamp) >= thirtyDayStartBucketMs);
        const creationTimeMs = table.creationDateTime ? Date.parse(table.creationDateTime) : Number.NaN;
        const hasCompleteNinetyDayWindow =
          !Number.isNaN(creationTimeMs) &&
          creationTimeMs <= ninetyDayStartTime.getTime() &&
          writeMetricData.has(writeMetricId);

        return {
          accountId: table.accountId,
          region,
          tableArn: table.tableArn,
          tableName: table.tableName,
          totalConsumedReadCapacityUnitsLast30Days:
            readPoints.length >= REQUIRED_DYNAMODB_DAILY_POINTS
              ? readPoints.reduce((sum, point) => sum + point.value, 0)
              : null,
          totalConsumedWriteCapacityUnitsLast30Days:
            recentWritePoints.length >= REQUIRED_DYNAMODB_DAILY_POINTS
              ? recentWritePoints.reduce((sum, point) => sum + point.value, 0)
              : null,
          totalConsumedWriteCapacityUnitsLast90Days: hasCompleteNinetyDayWindow
            ? writePoints.reduce((sum, point) => sum + point.value, 0)
            : null,
        } satisfies AwsDynamoDbTableUtilization;
      });
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.tableArn.localeCompare(right.tableArn));
};
