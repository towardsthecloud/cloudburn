import { DescribeSecretCommand } from '@aws-sdk/client-secrets-manager';
import type { AwsDiscoveredResource, AwsSecretsManagerSecret } from '@cloudburn/rules';
import { createSecretsManagerClient } from '../client.js';
import { chunkItems, withAwsServiceErrorContext } from './utils.js';

const SECRETS_MANAGER_CONCURRENCY = 10;

/**
 * Hydrates discovered Secrets Manager secrets with last-access metadata.
 *
 * @param resources - Catalog resources filtered to Secrets Manager secrets.
 * @returns Hydrated secrets for rule evaluation.
 */
export const hydrateAwsSecretsManagerSecrets = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsSecretsManagerSecret[]> => {
  const secretsByRegion = new Map<string, AwsDiscoveredResource[]>();

  for (const resource of resources) {
    const regionSecrets = secretsByRegion.get(resource.region) ?? [];
    regionSecrets.push(resource);
    secretsByRegion.set(resource.region, regionSecrets);
  }

  const hydratedPages = await Promise.all(
    [...secretsByRegion.entries()].map(async ([region, regionSecrets]) => {
      const client = createSecretsManagerClient({ region });
      const secrets: AwsSecretsManagerSecret[] = [];

      for (const batch of chunkItems(regionSecrets, SECRETS_MANAGER_CONCURRENCY)) {
        const hydratedBatch = await Promise.all(
          batch.map(async (resource) => {
            const response = await withAwsServiceErrorContext('AWS Secrets Manager', 'DescribeSecret', region, () =>
              client.send(
                new DescribeSecretCommand({
                  SecretId: resource.arn,
                }),
              ),
            );

            return {
              accountId: resource.accountId,
              lastAccessedDate: response.LastAccessedDate?.toISOString(),
              region,
              secretArn: response.ARN ?? resource.arn,
              secretName: response.Name ?? resource.name ?? resource.arn,
            } satisfies AwsSecretsManagerSecret;
          }),
        );

        secrets.push(...hydratedBatch);
      }

      return secrets;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.secretArn.localeCompare(right.secretArn));
};
