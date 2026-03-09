import { paginateListFunctions } from '@aws-sdk/client-lambda';
import type { AwsLambdaFunction } from '@cloudburn/rules';
import { createLambdaClient } from '../client.js';

const DEFAULT_LAMBDA_ARCHITECTURES = ['x86_64'];

/**
 * Discover Lambda functions across the given AWS regions.
 *
 * Missing `Architectures` values are normalized to Lambda's default `x86_64`.
 * Regional `ListFunctions` failures are treated as partial discovery and only
 * drop the failed region.
 */
export const discoverAwsLambdaFunctions = async (
  regions: string[],
  accountId: string,
): Promise<AwsLambdaFunction[]> => {
  const functionPages = await Promise.allSettled(
    regions.map(async (region) => {
      const client = createLambdaClient({ region });
      const functions: AwsLambdaFunction[] = [];

      for await (const page of paginateListFunctions({ client }, {})) {
        for (const fn of page.Functions ?? []) {
          if (!fn.FunctionName) {
            continue;
          }

          functions.push({
            functionName: fn.FunctionName,
            architectures: fn.Architectures?.map(String) ?? [...DEFAULT_LAMBDA_ARCHITECTURES],
            region,
            accountId,
          });
        }
      }

      return functions;
    }),
  );

  return functionPages.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
};
