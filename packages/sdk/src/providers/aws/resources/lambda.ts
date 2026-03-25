import { GetFunctionConfigurationCommand } from '@aws-sdk/client-lambda';
import type { AwsDiscoveredResource, AwsLambdaFunction, AwsLambdaFunctionMetric } from '@cloudburn/rules';
import { createLambdaClient } from '../client.js';
import { fetchCloudWatchSignals } from './cloudwatch.js';
import { chunkItems, withAwsServiceErrorContext } from './utils.js';

const DEFAULT_LAMBDA_ARCHITECTURES = ['x86_64'];
const DEFAULT_LAMBDA_MEMORY_MB = 128;
const DEFAULT_LAMBDA_TIMEOUT_SECONDS = 3;
const LAMBDA_CONFIGURATION_CONCURRENCY = 5;
const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;

const getSum = (values: Array<{ value: number }>): number => values.reduce((sum, point) => sum + point.value, 0);

const getAverage = (values: Array<{ value: number }>): number | null =>
  values.length === 0 ? null : getSum(values) / values.length;

const inferFunctionName = (arn: string): string | null => {
  const arnSegments = arn.split(':');
  const resourceType = arnSegments[5];

  if (resourceType !== 'function') {
    return null;
  }

  return arnSegments[6] ?? null;
};

/**
 * Hydrates discovered Lambda functions with their architecture metadata.
 *
 * @param resources - Catalog resources filtered to Lambda function resource types.
 * @returns Hydrated Lambda function models for rule evaluation.
 */
export const hydrateAwsLambdaFunctions = async (resources: AwsDiscoveredResource[]): Promise<AwsLambdaFunction[]> => {
  const resourcesByRegion = new Map<string, AwsDiscoveredResource[]>();

  for (const resource of resources) {
    if (resource.resourceType !== 'lambda:function') {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push(resource);
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const client = createLambdaClient({ region });
      const functions: AwsLambdaFunction[] = [];

      for (const batch of chunkItems(regionResources, LAMBDA_CONFIGURATION_CONCURRENCY)) {
        const hydratedBatch = await Promise.all(
          batch.map(async (resource) => {
            const response = await withAwsServiceErrorContext('AWS Lambda', 'GetFunctionConfiguration', region, () =>
              client.send(
                new GetFunctionConfigurationCommand({
                  FunctionName: resource.arn,
                }),
              ),
            );

            const functionName = response.FunctionName ?? inferFunctionName(resource.arn);

            if (!functionName) {
              return null;
            }

            return {
              accountId: resource.accountId,
              architectures: response.Architectures?.map(String) ?? [...DEFAULT_LAMBDA_ARCHITECTURES],
              functionName,
              memorySizeMb: response.MemorySize ?? DEFAULT_LAMBDA_MEMORY_MB,
              region,
              timeoutSeconds: response.Timeout ?? DEFAULT_LAMBDA_TIMEOUT_SECONDS,
            } satisfies AwsLambdaFunction;
          }),
        );

        functions.push(...hydratedBatch.flatMap((fn): AwsLambdaFunction[] => (fn ? [fn] : [])));
      }

      return functions;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.functionName.localeCompare(right.functionName));
};

/**
 * Hydrates discovered Lambda functions with their recent invocation, error, and duration summaries.
 *
 * @param resources - Catalog resources filtered to Lambda function resource types.
 * @returns Hydrated Lambda function metric models for rule evaluation.
 */
export const hydrateAwsLambdaFunctionMetrics = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsLambdaFunctionMetric[]> => {
  const functions = await hydrateAwsLambdaFunctions(resources);
  const functionsByRegion = new Map<string, AwsLambdaFunction[]>();

  for (const fn of functions) {
    const regionFunctions = functionsByRegion.get(fn.region) ?? [];
    regionFunctions.push(fn);
    functionsByRegion.set(fn.region, regionFunctions);
  }

  const hydratedPages = await Promise.all(
    [...functionsByRegion.entries()].map(async ([region, regionFunctions]) => {
      const metricData = await fetchCloudWatchSignals({
        endTime: new Date(),
        queries: regionFunctions.flatMap((fn, index) => [
          {
            dimensions: [{ Name: 'FunctionName', Value: fn.functionName }],
            id: `invocations${index}`,
            metricName: 'Invocations',
            namespace: 'AWS/Lambda',
            period: SEVEN_DAYS_IN_SECONDS,
            stat: 'Sum' as const,
          },
          {
            dimensions: [{ Name: 'FunctionName', Value: fn.functionName }],
            id: `errors${index}`,
            metricName: 'Errors',
            namespace: 'AWS/Lambda',
            period: SEVEN_DAYS_IN_SECONDS,
            stat: 'Sum' as const,
          },
          {
            dimensions: [{ Name: 'FunctionName', Value: fn.functionName }],
            id: `duration${index}`,
            metricName: 'Duration',
            namespace: 'AWS/Lambda',
            period: SEVEN_DAYS_IN_SECONDS,
            stat: 'Average' as const,
          },
        ]),
        region,
        startTime: new Date(Date.now() - SEVEN_DAYS_IN_SECONDS * 1000),
      });

      return regionFunctions.map((fn, index) => {
        const invocationPoints = metricData.get(`invocations${index}`) ?? [];
        const errorPoints = metricData.get(`errors${index}`) ?? [];
        const durationPoints = metricData.get(`duration${index}`) ?? [];
        const totalInvocationsLast7Days = invocationPoints.length > 0 ? getSum(invocationPoints) : null;

        return {
          accountId: fn.accountId,
          averageDurationMsLast7Days:
            totalInvocationsLast7Days !== null && totalInvocationsLast7Days > 0 ? getAverage(durationPoints) : null,
          functionName: fn.functionName,
          region: fn.region,
          totalErrorsLast7Days: totalInvocationsLast7Days !== null ? getSum(errorPoints) : null,
          totalInvocationsLast7Days,
        } satisfies AwsLambdaFunctionMetric;
      });
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.functionName.localeCompare(right.functionName));
};
