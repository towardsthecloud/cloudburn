import { GetFunctionConfigurationCommand } from '@aws-sdk/client-lambda';
import type { AwsDiscoveredResource, AwsLambdaFunction } from '@cloudburn/rules';
import { createLambdaClient } from '../client.js';

const DEFAULT_LAMBDA_ARCHITECTURES = ['x86_64'];
const LAMBDA_CONFIGURATION_CONCURRENCY = 10;

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

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

      for (const batch of chunk(regionResources, LAMBDA_CONFIGURATION_CONCURRENCY)) {
        const hydratedBatch = await Promise.all(
          batch.map(async (resource) => {
            const response = await client.send(
              new GetFunctionConfigurationCommand({
                FunctionName: resource.arn,
              }),
            );

            const functionName = response.FunctionName ?? inferFunctionName(resource.arn);

            if (!functionName) {
              return null;
            }

            return {
              accountId: resource.accountId,
              architectures: response.Architectures?.map(String) ?? [...DEFAULT_LAMBDA_ARCHITECTURES],
              functionName,
              region,
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
