import { GetLifecyclePolicyCommand } from '@aws-sdk/client-ecr';
import type { AwsDiscoveredResource, AwsEcrRepository } from '@cloudburn/rules';
import { createEcrClient } from '../client.js';
import { chunkItems, withAwsServiceErrorContext } from './utils.js';

const ECR_LIFECYCLE_POLICY_BATCH_SIZE = 25;
const ECR_REPOSITORY_ARN_PREFIX = 'repository/';

const inferRepositoryName = (resource: AwsDiscoveredResource): string | null => {
  if (resource.name) {
    return resource.name;
  }

  const arnSegments = resource.arn.split(':');
  const resourceSegment = arnSegments[5];

  if (!resourceSegment?.startsWith(ECR_REPOSITORY_ARN_PREFIX)) {
    return null;
  }

  return resourceSegment.slice(ECR_REPOSITORY_ARN_PREFIX.length);
};

const isLifecyclePolicyMissingError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'LifecyclePolicyNotFoundException';

const isRepositoryMissingError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'RepositoryNotFoundException';

/**
 * Hydrates discovered ECR repositories with lifecycle-policy state.
 *
 * @param resources - Catalog resources filtered to ECR repository resource types.
 * @returns Hydrated ECR repositories for rule evaluation.
 */
export const hydrateAwsEcrRepositories = async (resources: AwsDiscoveredResource[]): Promise<AwsEcrRepository[]> => {
  const resourcesByRegion = new Map<string, AwsDiscoveredResource[]>();

  for (const resource of resources) {
    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push(resource);
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const client = createEcrClient({ region });
      const repositories: AwsEcrRepository[] = [];

      for (const batch of chunkItems(regionResources, ECR_LIFECYCLE_POLICY_BATCH_SIZE)) {
        const hydratedBatch = await Promise.all(
          batch.flatMap((resource) => {
            const repositoryName = inferRepositoryName(resource);

            if (!repositoryName) {
              return [];
            }

            return [
              (async (): Promise<AwsEcrRepository | null> => {
                let hasLifecyclePolicy = false;

                try {
                  await withAwsServiceErrorContext('Amazon ECR', 'GetLifecyclePolicy', region, () =>
                    client.send(
                      new GetLifecyclePolicyCommand({
                        repositoryName,
                      }),
                    ),
                  );
                  hasLifecyclePolicy = true;
                } catch (error) {
                  if (isRepositoryMissingError(error)) {
                    return null;
                  }

                  if (!isLifecyclePolicyMissingError(error)) {
                    throw error;
                  }
                }

                return {
                  accountId: resource.accountId,
                  arn: resource.arn,
                  hasLifecyclePolicy,
                  region,
                  repositoryName,
                };
              })(),
            ];
          }),
        );

        repositories.push(...hydratedBatch.flatMap((repository) => (repository ? [repository] : [])));
      }

      return repositories;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.repositoryName.localeCompare(right.repositoryName));
};
