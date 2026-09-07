import { GetLambdaFunctionRecommendationsCommand } from '@aws-sdk/client-compute-optimizer';
import { ListFunctionsCommand } from '@aws-sdk/client-lambda';
import type {
  AwsDiscoveredResource,
  AwsLambdaFunction,
  AwsLambdaFunctionMetric,
  AwsLambdaMemoryRecommendation,
} from '@cloudburn/rules';
import { createComputeOptimizerClient, createLambdaClient } from '../client.js';
import type { AwsDiscoveryDatasetResolver } from '../discovery-registry.js';
import { getAwsDiscoveryTimestamp } from '../execution.js';
import {
  type CloudWatchMetricPoint,
  cloudWatchWindow,
  fetchCloudWatchSignals,
  getCompleteCloudWatchPoints,
} from './cloudwatch.js';
import { getUnqualifiedLambdaFunctionArn } from './lambda-identity.js';
import { extractTerminalArnResourceIdentifier, withAwsServiceErrorContext } from './utils.js';

const DEFAULT_LAMBDA_ARCHITECTURES = ['x86_64'];
const DEFAULT_LAMBDA_MEMORY_MB = 128;
const DEFAULT_LAMBDA_TIMEOUT_SECONDS = 3;
const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;
const LAMBDA_METRIC_PERIOD_IN_SECONDS = 60 * 60;

const getSum = (values: Array<{ value: number }>): number => values.reduce((sum, point) => sum + point.value, 0);

const getDurationAverage = (
  sums: CloudWatchMetricPoint[] | undefined,
  counts: CloudWatchMetricPoint[] | undefined,
): number | null => {
  if (!sums?.length || !counts?.length || sums.length !== counts.length) return null;
  const countsByTimestamp = new Map(counts.map((point) => [point.timestamp, point.value]));
  if (sums.some((point) => point.value < 0 || (countsByTimestamp.get(point.timestamp) ?? 0) <= 0)) return null;
  return getSum(sums) / getSum(counts);
};

const groupLambdaResourcesByRegion = (resources: AwsDiscoveredResource[]): Map<string, AwsDiscoveredResource[]> => {
  const resourcesByRegion = new Map<string, AwsDiscoveredResource[]>();

  for (const resource of resources) {
    if (resource.resourceType !== 'lambda:function') {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push(resource);
    resourcesByRegion.set(resource.region, regionResources);
  }

  return resourcesByRegion;
};

/**
 * Hydrates discovered Lambda functions with their architecture metadata.
 *
 * @param resources - Catalog resources filtered to Lambda function resource types.
 * @returns Hydrated Lambda function models for rule evaluation.
 */
export const hydrateAwsLambdaFunctions = async (resources: AwsDiscoveredResource[]): Promise<AwsLambdaFunction[]> => {
  const resourcesByRegion = groupLambdaResourcesByRegion(resources);

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const client = createLambdaClient({ region });
      const functions: AwsLambdaFunction[] = [];
      const resourcesByArn = new Map(regionResources.map((resource) => [resource.arn, resource]));

      let marker: string | undefined;

      do {
        const page = await withAwsServiceErrorContext('AWS Lambda', 'ListFunctions', region, () =>
          client.send(new ListFunctionsCommand({ Marker: marker })),
        );

        for (const listedFunction of page.Functions ?? []) {
          const functionName =
            listedFunction.FunctionName ??
            (listedFunction.FunctionArn ? extractTerminalArnResourceIdentifier(listedFunction.FunctionArn) : null);
          const resource = listedFunction.FunctionArn ? resourcesByArn.get(listedFunction.FunctionArn) : undefined;

          if (!functionName || !resource) {
            continue;
          }

          functions.push({
            accountId: resource.accountId,
            architectures: listedFunction.Architectures?.map(String) ?? [...DEFAULT_LAMBDA_ARCHITECTURES],
            functionArn: listedFunction.FunctionArn,
            functionName,
            memorySizeMb: listedFunction.MemorySize ?? DEFAULT_LAMBDA_MEMORY_MB,
            region,
            timeoutSeconds: listedFunction.Timeout ?? DEFAULT_LAMBDA_TIMEOUT_SECONDS,
          });
        }

        marker = page.NextMarker;
      } while (marker);

      return functions;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.functionName.localeCompare(right.functionName));
};

/**
 * Loads AWS Compute Optimizer recommendations for memory-overprovisioned Lambda functions.
 *
 * @param resources - Catalog resources filtered to Lambda functions.
 * @returns Memory recommendations for selected functions that Compute Optimizer marks overprovisioned.
 */
export const hydrateAwsLambdaMemoryRecommendations = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsLambdaMemoryRecommendation[]> => {
  const resourcesByRegion = groupLambdaResourcesByRegion(resources);

  const recommendationPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const client = createComputeOptimizerClient({ region });
      const resourcesByArn = new Map(regionResources.map((resource) => [resource.arn, resource]));
      const recommendations: AwsLambdaMemoryRecommendation[] = [];
      let nextToken: string | undefined;

      do {
        const page = await withAwsServiceErrorContext(
          'AWS Compute Optimizer',
          'GetLambdaFunctionRecommendations',
          region,
          () =>
            client.send(
              new GetLambdaFunctionRecommendationsCommand({
                filters: [
                  {
                    name: 'FindingReasonCode',
                    values: ['MemoryOverprovisioned'],
                  },
                ],
                nextToken,
              }),
            ),
        );

        for (const recommendation of page.lambdaFunctionRecommendations ?? []) {
          const functionArn = recommendation.functionArn
            ? getUnqualifiedLambdaFunctionArn(recommendation.functionArn)
            : undefined;
          const resource = functionArn ? resourcesByArn.get(functionArn) : undefined;

          if (!functionArn || !resource || !recommendation.findingReasonCodes?.includes('MemoryOverprovisioned')) {
            continue;
          }

          recommendations.push({
            accountId: recommendation.accountId ?? resource.accountId,
            functionArn,
            region,
          });
        }

        nextToken = page.nextToken;
      } while (nextToken);

      return recommendations;
    }),
  );

  return recommendationPages.flat().sort((left, right) => left.functionArn.localeCompare(right.functionArn));
};

/**
 * Hydrates discovered Lambda functions with their recent invocation, error, and duration summaries.
 *
 * @param resources - Catalog resources filtered to Lambda function resource types.
 * @returns Hydrated Lambda function metric models for rule evaluation.
 */
export const hydrateAwsLambdaFunctionMetrics = async (
  resources: AwsDiscoveredResource[],
  context?: AwsDiscoveryDatasetResolver,
): Promise<AwsLambdaFunctionMetric[]> => {
  const functions = context
    ? await context.loadDataset('aws-lambda-functions')
    : await hydrateAwsLambdaFunctions(resources);
  const functionsByRegion = new Map<string, AwsLambdaFunction[]>();

  for (const fn of functions) {
    const regionFunctions = functionsByRegion.get(fn.region) ?? [];
    regionFunctions.push(fn);
    functionsByRegion.set(fn.region, regionFunctions);
  }

  const hydratedPages = await Promise.all(
    [...functionsByRegion.entries()].map(async ([region, regionFunctions]) => {
      const metricData = await fetchCloudWatchSignals({
        ...cloudWatchWindow({
          endTime: new Date(getAwsDiscoveryTimestamp()),
          lookbackSeconds: SEVEN_DAYS_IN_SECONDS,
          mode: 'rolling',
        }),
        queries: regionFunctions.flatMap((fn, index) => [
          {
            dimensions: [{ Name: 'FunctionName', Value: fn.functionName }],
            id: `invocations${index}`,
            metricName: 'Invocations',
            namespace: 'AWS/Lambda',
            period: LAMBDA_METRIC_PERIOD_IN_SECONDS,
            stat: 'Sum' as const,
          },
          {
            dimensions: [{ Name: 'FunctionName', Value: fn.functionName }],
            id: `errors${index}`,
            metricName: 'Errors',
            namespace: 'AWS/Lambda',
            period: LAMBDA_METRIC_PERIOD_IN_SECONDS,
            stat: 'Sum' as const,
          },
          {
            dimensions: [{ Name: 'FunctionName', Value: fn.functionName }],
            id: `durationSum${index}`,
            metricName: 'Duration',
            namespace: 'AWS/Lambda',
            period: LAMBDA_METRIC_PERIOD_IN_SECONDS,
            stat: 'Sum' as const,
          },
          {
            dimensions: [{ Name: 'FunctionName', Value: fn.functionName }],
            id: `durationCount${index}`,
            metricName: 'Duration',
            namespace: 'AWS/Lambda',
            period: LAMBDA_METRIC_PERIOD_IN_SECONDS,
            stat: 'SampleCount' as const,
          },
        ]),
        region,
      });

      return regionFunctions.map((fn, index) => {
        const invocationPoints = getCompleteCloudWatchPoints(metricData.get(`invocations${index}`)) ?? [];
        const errorPoints = getCompleteCloudWatchPoints(metricData.get(`errors${index}`));
        const durationSums = getCompleteCloudWatchPoints(metricData.get(`durationSum${index}`));
        const durationCounts = getCompleteCloudWatchPoints(metricData.get(`durationCount${index}`));
        const totalInvocationsLast7Days = invocationPoints.length > 0 ? getSum(invocationPoints) : null;

        return {
          accountId: fn.accountId,
          averageDurationMsLast7Days:
            totalInvocationsLast7Days !== null && totalInvocationsLast7Days > 0
              ? getDurationAverage(durationSums, durationCounts)
              : null,
          functionName: fn.functionName,
          region: fn.region,
          totalErrorsLast7Days:
            totalInvocationsLast7Days !== null && errorPoints !== undefined ? getSum(errorPoints) : null,
          totalInvocationsLast7Days,
        } satisfies AwsLambdaFunctionMetric;
      });
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.functionName.localeCompare(right.functionName));
};
