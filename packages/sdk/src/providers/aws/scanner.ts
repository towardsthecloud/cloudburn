import type { LiveEvaluationContext } from '@cloudburn/rules';
import { resolveAwsRegions } from './client.js';
import { discoverAwsEbsVolumes } from './resources/ebs.js';

export const scanAwsResources = async (regions: string[]): Promise<LiveEvaluationContext> => ({
  ebsVolumes: await discoverAwsEbsVolumes(await resolveAwsRegions(regions)),
});
