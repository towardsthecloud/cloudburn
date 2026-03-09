import type { LiveEvaluationContext } from '@cloudburn/rules';
import { resolveAwsAccountId, resolveAwsRegions } from './client.js';
import { discoverAwsEbsVolumes } from './resources/ebs.js';
import { discoverAwsLambdaFunctions } from './resources/lambda.js';

/** Discover AWS resources for live rule evaluation, degrading to partial results when a discoverer fails. */
export const scanAwsResources = async (regions: string[]): Promise<LiveEvaluationContext> => {
  const [resolvedRegions, accountId] = await Promise.all([resolveAwsRegions(regions), resolveAwsAccountId()]);
  const [ebsVolumesResult, lambdaFunctionsResult] = await Promise.allSettled([
    discoverAwsEbsVolumes(resolvedRegions, accountId),
    discoverAwsLambdaFunctions(resolvedRegions, accountId),
  ]);

  return {
    ebsVolumes: ebsVolumesResult.status === 'fulfilled' ? ebsVolumesResult.value : [],
    lambdaFunctions: lambdaFunctionsResult.status === 'fulfilled' ? lambdaFunctionsResult.value : [],
  };
};
