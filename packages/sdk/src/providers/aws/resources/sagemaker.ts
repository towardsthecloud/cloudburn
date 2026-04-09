import {
  DescribeEndpointCommand,
  DescribeEndpointConfigCommand,
  DescribeNotebookInstanceCommand,
} from '@aws-sdk/client-sagemaker';
import type {
  AwsDiscoveredResource,
  AwsSageMakerEndpointActivity,
  AwsSageMakerNotebookInstance,
} from '@cloudburn/rules';
import { createSageMakerClient } from '../client.js';
import { fetchCloudWatchSignals } from './cloudwatch.js';
import { chunkItems, extractTerminalResourceIdentifier, withAwsServiceErrorContext } from './utils.js';

const NOTEBOOK_INSTANCE_BATCH_SIZE = 10;
const ENDPOINT_BATCH_SIZE = 10;
const FOURTEEN_DAYS_IN_SECONDS = 14 * 24 * 60 * 60;
const DAILY_PERIOD_IN_SECONDS = 24 * 60 * 60;
const REQUIRED_ENDPOINT_DAILY_POINTS = FOURTEEN_DAYS_IN_SECONDS / DAILY_PERIOD_IN_SECONDS;

const isNotebookInstanceMissingError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const candidates = [error.name, error.message].map((value) => value.toLowerCase());

  return (
    candidates.some((value) => value.includes('resourcenotfound')) ||
    candidates.some((value) => value.includes('could not find notebook instance')) ||
    candidates.some((value) => value.includes('notebook instance') && value.includes('not found')) ||
    candidates.some((value) => value.includes('validationexception') && value.includes('notebook instance'))
  );
};

const isEndpointMissingError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const candidates = [error.name, error.message].map((value) => value.toLowerCase());

  return (
    candidates.some((value) => value.includes('resourcenotfound')) ||
    candidates.some((value) => value.includes('could not find endpoint')) ||
    candidates.some((value) => value.includes('endpoint') && value.includes('not found'))
  );
};

const isEndpointConfigMissingError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const candidates = [error.name, error.message].map((value) => value.toLowerCase());

  return (
    candidates.some((value) => value.includes('resourcenotfound')) ||
    candidates.some((value) => value.includes('could not find endpoint config')) ||
    candidates.some((value) => value.includes('could not find the endpoint configuration')) ||
    candidates.some((value) => value.includes('endpoint config') && value.includes('not found')) ||
    candidates.some((value) => value.includes('endpoint configuration') && value.includes('not found'))
  );
};

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
            try {
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
                {
                  passthrough: isNotebookInstanceMissingError,
                },
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
            } catch (error) {
              if (isNotebookInstanceMissingError(error)) {
                return null;
              }

              throw error;
            }
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

/**
 * Hydrates discovered SageMaker endpoints with endpoint metadata and a 14-day
 * invocation total aggregated across production variants.
 *
 * @param resources - Catalog resources filtered to SageMaker endpoint resource types.
 * @returns Hydrated SageMaker endpoints for rule evaluation.
 */
export const hydrateAwsSageMakerEndpointActivity = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsSageMakerEndpointActivity[]> => {
  const resourcesByRegion = new Map<string, Array<{ accountId: string; endpointArn: string; endpointName: string }>>();

  for (const resource of resources) {
    const endpointName = extractTerminalResourceIdentifier(resource.name, resource.arn);

    if (!endpointName) {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push({
      accountId: resource.accountId,
      endpointArn: resource.arn,
      endpointName,
    });
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const client = createSageMakerClient({ region });
      const endpoints: AwsSageMakerEndpointActivity[] = [];

      for (const batch of chunkItems(regionResources, ENDPOINT_BATCH_SIZE)) {
        const hydratedBatch = await Promise.all(
          batch.map(async (resource) => {
            try {
              const endpointResponse = await withAwsServiceErrorContext(
                'Amazon SageMaker',
                'DescribeEndpoint',
                region,
                () =>
                  client.send(
                    new DescribeEndpointCommand({
                      EndpointName: resource.endpointName,
                    }),
                  ),
                {
                  passthrough: isEndpointMissingError,
                },
              );

              if (
                !endpointResponse.EndpointArn ||
                !endpointResponse.EndpointName ||
                !endpointResponse.EndpointStatus ||
                !endpointResponse.EndpointConfigName
              ) {
                return null;
              }

              const endpointConfigResponse = await withAwsServiceErrorContext(
                'Amazon SageMaker',
                'DescribeEndpointConfig',
                region,
                () =>
                  client.send(
                    new DescribeEndpointConfigCommand({
                      EndpointConfigName: endpointResponse.EndpointConfigName,
                    }),
                  ),
                {
                  passthrough: isEndpointConfigMissingError,
                },
              );

              return {
                accountId: resource.accountId,
                creationTime: endpointResponse.CreationTime?.toISOString(),
                endpointArn: endpointResponse.EndpointArn,
                endpointConfigName: endpointResponse.EndpointConfigName,
                endpointName: endpointResponse.EndpointName,
                endpointStatus: endpointResponse.EndpointStatus,
                lastModifiedTime: endpointResponse.LastModifiedTime?.toISOString(),
                productionVariantNames: (endpointConfigResponse.ProductionVariants ?? []).flatMap((variant) =>
                  variant.VariantName ? [variant.VariantName] : [],
                ),
              };
            } catch (error) {
              if (isEndpointMissingError(error) || isEndpointConfigMissingError(error)) {
                return null;
              }

              throw error;
            }
          }),
        );

        const completeEndpoints = hydratedBatch.flatMap((endpoint) => (endpoint ? [endpoint] : []));

        const metricData =
          completeEndpoints.length > 0
            ? await fetchCloudWatchSignals({
                endTime: new Date(),
                queries: completeEndpoints.flatMap((endpoint, endpointIndex) =>
                  endpoint.productionVariantNames.map((variantName, variantIndex) => ({
                    dimensions: [
                      { Name: 'EndpointName', Value: endpoint.endpointName },
                      { Name: 'VariantName', Value: variantName },
                    ],
                    id: `endpoint${endpointIndex}variant${variantIndex}`,
                    metricName: 'Invocations',
                    namespace: 'AWS/SageMaker',
                    period: DAILY_PERIOD_IN_SECONDS,
                    stat: 'Sum' as const,
                  })),
                ),
                region,
                startTime: new Date(Date.now() - FOURTEEN_DAYS_IN_SECONDS * 1000),
              })
            : new Map();

        endpoints.push(
          ...completeEndpoints.map((endpoint, endpointIndex) => {
            const totalInvocationsLast14Days =
              endpoint.productionVariantNames.length > 0 &&
              endpoint.productionVariantNames.every((_variantName, variantIndex) => {
                const points = metricData.get(`endpoint${endpointIndex}variant${variantIndex}`) ?? [];

                return points.length === 0 || points.length >= REQUIRED_ENDPOINT_DAILY_POINTS;
              })
                ? endpoint.productionVariantNames.reduce((sum, _variantName, variantIndex) => {
                    const points = metricData.get(`endpoint${endpointIndex}variant${variantIndex}`) ?? [];

                    return (
                      sum + points.reduce((pointSum: number, point: { value: number }) => pointSum + point.value, 0)
                    );
                  }, 0)
                : null;

            return {
              accountId: endpoint.accountId,
              creationTime: endpoint.creationTime,
              endpointArn: endpoint.endpointArn,
              endpointConfigName: endpoint.endpointConfigName,
              endpointName: endpoint.endpointName,
              endpointStatus: endpoint.endpointStatus,
              lastModifiedTime: endpoint.lastModifiedTime,
              region,
              totalInvocationsLast14Days,
            } satisfies AwsSageMakerEndpointActivity;
          }),
        );
      }

      return endpoints;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.endpointName.localeCompare(right.endpointName));
};
