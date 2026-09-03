import { ListSecretsCommand } from '@aws-sdk/client-secrets-manager';
import type { AwsDiscoveredResource, AwsSecretsManagerSecret } from '@cloudburn/rules';
import { createSecretsManagerClient } from '../client.js';
import { withAwsServiceErrorContext } from './utils.js';

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
      const resourcesByArn = new Map(regionSecrets.map((resource) => [resource.arn, resource]));
      let nextToken: string | undefined;

      do {
        const response = await withAwsServiceErrorContext('AWS Secrets Manager', 'ListSecrets', region, () =>
          client.send(new ListSecretsCommand({ NextToken: nextToken })),
        );

        for (const listedSecret of response.SecretList ?? []) {
          const secretArn = listedSecret.ARN;

          if (!secretArn) {
            continue;
          }

          const resource = resourcesByArn.get(secretArn);

          if (!resource) {
            continue;
          }

          resourcesByArn.delete(secretArn);
          secrets.push({
            accountId: resource.accountId,
            lastAccessedDate: listedSecret.LastAccessedDate?.toISOString(),
            region,
            secretArn: resource.arn,
            secretName: listedSecret.Name ?? resource.name ?? resource.arn,
          });
        }

        nextToken = response.NextToken;
      } while (nextToken && resourcesByArn.size > 0);

      return secrets;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.secretArn.localeCompare(right.secretArn));
};
