import {
  GetBucketLifecycleConfigurationCommand,
  ListBucketIntelligentTieringConfigurationsCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import type { AwsDiscoveredResource, AwsS3BucketAnalysis } from '@cloudburn/rules';
import { createS3Client } from '../client.js';
import { buildS3BucketAnalysisFlags } from './s3-analysis.js';
import { chunkItems } from './utils.js';

const S3_HYDRATION_CONCURRENCY = 10;

const extractBucketName = (resource: AwsDiscoveredResource): string | null => {
  if (resource.name) {
    return resource.name;
  }

  const arnSegments = resource.arn.split(':');
  return arnSegments[5] ?? null;
};

const loadBucketLifecycleRules = async (client: S3Client, bucketName: string): Promise<Record<string, unknown>[]> => {
  try {
    const response = await client.send(
      new GetBucketLifecycleConfigurationCommand({
        Bucket: bucketName,
      }),
    );

    return (response.Rules ?? []).flatMap((rule): Record<string, unknown>[] =>
      rule ? [rule as unknown as Record<string, unknown>] : [],
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'NoSuchLifecycleConfiguration') {
      return [];
    }

    throw error;
  }
};

const loadBucketIntelligentTieringConfigurations = async (
  client: S3Client,
  bucketName: string,
): Promise<Record<string, unknown>[]> => {
  const configurations: Record<string, unknown>[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListBucketIntelligentTieringConfigurationsCommand({
        Bucket: bucketName,
        ContinuationToken: continuationToken,
      }),
    );

    configurations.push(
      ...(response.IntelligentTieringConfigurationList ?? []).flatMap((configuration): Record<string, unknown>[] =>
        configuration ? [configuration as unknown as Record<string, unknown>] : [],
      ),
    );
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return configurations;
};

/**
 * Hydrates discovered S3 buckets with lifecycle and intelligent-tiering
 * metadata needed by the S3 optimization rules.
 *
 * @param resources - Catalog resources filtered to S3 bucket resource types.
 * @returns Hydrated S3 bucket analyses for rule evaluation.
 */
export const hydrateAwsS3BucketAnalyses = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsS3BucketAnalysis[]> => {
  const clientsByRegion = new Map<string, S3Client>();
  const resourcesByRegion = new Map<string, AwsDiscoveredResource[]>();

  for (const resource of resources) {
    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push(resource);
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const client = clientsByRegion.get(region) ?? createS3Client({ region });
      clientsByRegion.set(region, client);
      const analyses: AwsS3BucketAnalysis[] = [];

      for (const batch of chunkItems(regionResources, S3_HYDRATION_CONCURRENCY)) {
        const hydratedBatch = await Promise.all(
          batch.flatMap((resource) => {
            const bucketName = extractBucketName(resource);

            if (!bucketName) {
              return [];
            }

            return [
              (async (): Promise<AwsS3BucketAnalysis> => {
                const [lifecycleRules, intelligentTieringConfigurations] = await Promise.all([
                  loadBucketLifecycleRules(client, bucketName),
                  loadBucketIntelligentTieringConfigurations(client, bucketName),
                ]);

                return {
                  accountId: resource.accountId,
                  bucketName,
                  region: resource.region,
                  ...buildS3BucketAnalysisFlags(lifecycleRules, intelligentTieringConfigurations),
                };
              })(),
            ];
          }),
        );

        analyses.push(...hydratedBatch);
      }

      return analyses;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.bucketName.localeCompare(right.bucketName));
};
