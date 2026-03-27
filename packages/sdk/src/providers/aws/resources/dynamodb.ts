import { DescribeScalableTargetsCommand } from '@aws-sdk/client-application-auto-scaling';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import type {
  AwsDiscoveredResource,
  AwsDynamoDbAutoscaling,
  AwsDynamoDbTable,
  AwsDynamoDbTableUtilization,
} from '@cloudburn/rules';
import { createApplicationAutoScalingClient, createDynamoDbClient } from '../client.js';
import { fetchCloudWatchSignals } from './cloudwatch.js';
import { chunkItems, extractTerminalArnResourceIdentifier, withAwsServiceErrorContext } from './utils.js';

const DYNAMODB_TABLE_CONCURRENCY = 10;
const APPLICATION_AUTO_SCALING_BATCH_SIZE = 50;
const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;
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
export const hydrateAwsDynamoDbTables = async (resources: AwsDiscoveredResource[]): Promise<AwsDynamoDbTable[]> => {
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

      for (const batch of chunkItems(regionTables, DYNAMODB_TABLE_CONCURRENCY)) {
        const hydratedBatch = await Promise.all(
          batch.map(async (table) => {
            const response = await withAwsServiceErrorContext('Amazon DynamoDB', 'DescribeTable', region, () =>
              client.send(
                new DescribeTableCommand({
                  TableName: table.tableName,
                }),
              ),
            );
            const describedTable = response.Table;

            return {
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
            } satisfies AwsDynamoDbTable;
          }),
        );

        tables.push(...hydratedBatch);
      }

      return tables;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.tableArn.localeCompare(right.tableArn));
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
): Promise<AwsDynamoDbTableUtilization[]> => {
  const tables = await hydrateAwsDynamoDbTables(resources);
  const tablesByRegion = new Map<string, typeof tables>();

  for (const table of tables) {
    const regionTables = tablesByRegion.get(table.region) ?? [];
    regionTables.push(table);
    tablesByRegion.set(table.region, regionTables);
  }

  const hydratedPages = await Promise.all(
    [...tablesByRegion.entries()].map(async ([region, regionTables]) => {
      const metricData = await fetchCloudWatchSignals({
        endTime: new Date(),
        queries: regionTables.flatMap((table, index) => [
          {
            dimensions: [{ Name: 'TableName', Value: table.tableName }],
            id: `read${index}`,
            metricName: 'ConsumedReadCapacityUnits',
            namespace: 'AWS/DynamoDB',
            period: DAILY_PERIOD_IN_SECONDS,
            stat: 'Sum' as const,
          },
          {
            dimensions: [{ Name: 'TableName', Value: table.tableName }],
            id: `write${index}`,
            metricName: 'ConsumedWriteCapacityUnits',
            namespace: 'AWS/DynamoDB',
            period: DAILY_PERIOD_IN_SECONDS,
            stat: 'Sum' as const,
          },
        ]),
        region,
        startTime: new Date(Date.now() - THIRTY_DAYS_IN_SECONDS * 1000),
      });

      return regionTables.map((table, index) => {
        const readPoints = metricData.get(`read${index}`) ?? [];
        const writePoints = metricData.get(`write${index}`) ?? [];

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
            writePoints.length >= REQUIRED_DYNAMODB_DAILY_POINTS
              ? writePoints.reduce((sum, point) => sum + point.value, 0)
              : null,
        } satisfies AwsDynamoDbTableUtilization;
      });
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.tableArn.localeCompare(right.tableArn));
};
