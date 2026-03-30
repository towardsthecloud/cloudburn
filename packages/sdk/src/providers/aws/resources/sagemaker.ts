import { DescribeNotebookInstanceCommand } from '@aws-sdk/client-sagemaker';
import type { AwsDiscoveredResource, AwsSageMakerNotebookInstance } from '@cloudburn/rules';
import { createSageMakerClient } from '../client.js';
import { chunkItems, extractTerminalResourceIdentifier, withAwsServiceErrorContext } from './utils.js';

const NOTEBOOK_INSTANCE_BATCH_SIZE = 10;

/**
 * Hydrates discovered SageMaker notebook instances with their runtime metadata.
 *
 * @param resources - Catalog resources filtered to SageMaker notebook instance resource types.
 * @returns Hydrated notebook instances for rule evaluation.
 */
export const hydrateAwsSageMakerNotebookInstances = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsSageMakerNotebookInstance[]> => {
  const resourcesByRegion = new Map<string, Array<{ accountId: string; notebookInstanceName: string }>>();

  for (const resource of resources) {
    const notebookInstanceName = extractTerminalResourceIdentifier(resource.name, resource.arn);

    if (!notebookInstanceName) {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push({
      accountId: resource.accountId,
      notebookInstanceName,
    });
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const client = createSageMakerClient({ region });
      const notebookInstances: AwsSageMakerNotebookInstance[] = [];

      for (const batch of chunkItems(regionResources, NOTEBOOK_INSTANCE_BATCH_SIZE)) {
        const hydratedBatch = await Promise.all(
          batch.map(async (resource) => {
            const response = await withAwsServiceErrorContext(
              'Amazon SageMaker',
              'DescribeNotebookInstance',
              region,
              () =>
                client.send(
                  new DescribeNotebookInstanceCommand({
                    NotebookInstanceName: resource.notebookInstanceName,
                  }),
                ),
            );

            if (!response.NotebookInstanceName || !response.NotebookInstanceStatus || !response.InstanceType) {
              return null;
            }

            return {
              accountId: resource.accountId,
              instanceType: response.InstanceType,
              lastModifiedTime: response.LastModifiedTime?.toISOString(),
              notebookInstanceName: response.NotebookInstanceName,
              notebookInstanceStatus: response.NotebookInstanceStatus,
              region,
            } satisfies AwsSageMakerNotebookInstance;
          }),
        );

        notebookInstances.push(...hydratedBatch.flatMap((instance) => (instance ? [instance] : [])));
      }

      return notebookInstances;
    }),
  );

  return hydratedPages
    .flat()
    .sort((left, right) => left.notebookInstanceName.localeCompare(right.notebookInstanceName));
};
