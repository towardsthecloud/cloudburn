import { DescribeVpcEndpointsCommand } from '@aws-sdk/client-ec2';
import type { AwsDiscoveredResource, AwsEc2VpcEndpointActivity } from '@cloudburn/rules';
import { createEc2Client } from '../client.js';
import { fetchCloudWatchSignals } from './cloudwatch.js';
import { chunkItems, withAwsServiceErrorContext } from './utils.js';

const VPC_ENDPOINT_ARN_PREFIX = 'vpc-endpoint/';
const VPC_ENDPOINT_DESCRIBE_BATCH_SIZE = 100;
const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;
const DAILY_PERIOD_IN_SECONDS = 24 * 60 * 60;
const REQUIRED_VPC_ENDPOINT_DAILY_POINTS = THIRTY_DAYS_IN_SECONDS / DAILY_PERIOD_IN_SECONDS;

const isVpcEndpointMissingError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const serviceError = error as Error & { code?: string; Code?: string };
  const candidates = [error.name, serviceError.code, serviceError.Code, error.message]
    .filter((value): value is string => value !== undefined)
    .map((value) => value.toLowerCase());

  return candidates.some(
    (value) =>
      value.includes('invalidvpcendpointid.notfound') ||
      (value.includes('vpc endpoint') && value.includes('does not exist')),
  );
};

const describeVpcEndpointBatch = async (
  region: string,
  batch: Array<{ accountId: string; vpcEndpointId: string }>,
): Promise<
  Array<{
    accountId: string;
    region: string;
    serviceName: string;
    subnetIds: string[];
    vpcEndpointId: string;
    vpcEndpointType: string;
    vpcId: string;
  }>
> => {
  const client = createEc2Client({ region });

  try {
    const response = await withAwsServiceErrorContext(
      'Amazon EC2',
      'DescribeVpcEndpoints',
      region,
      () =>
        client.send(
          new DescribeVpcEndpointsCommand({
            VpcEndpointIds: batch.map(({ vpcEndpointId }) => vpcEndpointId),
          }),
        ),
      {
        passthrough: isVpcEndpointMissingError,
      },
    );

    return (response.VpcEndpoints ?? []).flatMap((endpoint) => {
      if (
        !endpoint.VpcEndpointId ||
        !endpoint.VpcId ||
        !endpoint.ServiceName ||
        endpoint.VpcEndpointType !== 'Interface'
      ) {
        return [];
      }

      const discoveredResource = batch.find(({ vpcEndpointId }) => vpcEndpointId === endpoint.VpcEndpointId);

      if (!discoveredResource) {
        return [];
      }

      return [
        {
          accountId: discoveredResource.accountId,
          region,
          serviceName: endpoint.ServiceName,
          subnetIds: (endpoint.SubnetIds ?? []).flatMap((subnetId) => (subnetId ? [subnetId] : [])),
          vpcEndpointId: endpoint.VpcEndpointId,
          vpcEndpointType: endpoint.VpcEndpointType.toLowerCase(),
          vpcId: endpoint.VpcId,
        },
      ];
    });
  } catch (error) {
    if (!isVpcEndpointMissingError(error)) {
      throw error;
    }

    if (batch.length === 1) {
      return [];
    }

    const describedResources = await Promise.all(
      batch.map(async (resource) => describeVpcEndpointBatch(region, [resource])),
    );
    return describedResources.flat();
  }
};

const extractVpcEndpointId = (resource: AwsDiscoveredResource): string | null => {
  if (resource.name?.startsWith('vpce-')) {
    return resource.name;
  }

  const arnSegments = resource.arn.split(':');
  const resourceSegment = arnSegments[5];

  if (!resourceSegment?.startsWith(VPC_ENDPOINT_ARN_PREFIX)) {
    return null;
  }

  return resourceSegment.slice(VPC_ENDPOINT_ARN_PREFIX.length);
};

/**
 * Hydrates discovered VPC endpoints with 30-day data transfer totals.
 *
 * @param resources - Catalog resources filtered to VPC endpoint resource types.
 * @returns Hydrated interface VPC endpoints for rule evaluation. Endpoints
 * with no or partial CloudWatch datapoints preserve `bytesProcessedLast30Days`
 * as `null`.
 */
export const hydrateAwsEc2VpcEndpointActivity = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsEc2VpcEndpointActivity[]> => {
  const resourcesByRegion = new Map<string, Array<{ accountId: string; vpcEndpointId: string }>>();

  for (const resource of resources) {
    const vpcEndpointId = extractVpcEndpointId(resource);

    if (!vpcEndpointId) {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push({
      accountId: resource.accountId,
      vpcEndpointId,
    });
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const interfaceEndpoints: AwsEc2VpcEndpointActivity[] = [];

      for (const batch of chunkItems(regionResources, VPC_ENDPOINT_DESCRIBE_BATCH_SIZE)) {
        const matchedEndpoints = await describeVpcEndpointBatch(region, batch);

        if (matchedEndpoints.length === 0) {
          continue;
        }

        const metricData = await fetchCloudWatchSignals({
          endTime: new Date(),
          queries: matchedEndpoints.map((endpoint, index) => ({
            dimensions: [
              { Name: 'Endpoint Type', Value: 'Interface' },
              { Name: 'Service Name', Value: endpoint.serviceName },
              { Name: 'VPC Endpoint Id', Value: endpoint.vpcEndpointId },
              { Name: 'VPC Id', Value: endpoint.vpcId },
            ],
            id: `vpce${index}`,
            metricName: 'BytesProcessed',
            namespace: 'AWS/PrivateLinkEndpoints',
            period: DAILY_PERIOD_IN_SECONDS,
            stat: 'Sum',
          })),
          region,
          startTime: new Date(Date.now() - THIRTY_DAYS_IN_SECONDS * 1000),
        });

        interfaceEndpoints.push(
          ...matchedEndpoints.map((endpoint, index) => {
            const points = metricData.get(`vpce${index}`) ?? [];

            return {
              ...endpoint,
              bytesProcessedLast30Days:
                points.length >= REQUIRED_VPC_ENDPOINT_DAILY_POINTS
                  ? points.reduce((sum, point) => sum + point.value, 0)
                  : null,
            };
          }),
        );
      }

      return interfaceEndpoints;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.vpcEndpointId.localeCompare(right.vpcEndpointId));
};
