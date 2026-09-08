import { DescribeNatGatewaysCommand } from '@aws-sdk/client-ec2';
import type { AwsDiscoveredResource, AwsEc2NatGatewayActivity } from '@cloudburn/rules';
import { createEc2Client } from '../client.js';
import { getAwsDiscoveryTimestamp } from '../execution.js';
import { cloudWatchWindow, getCompleteCloudWatchPoints } from './cloudwatch.js';
import { collectResourceMetrics } from './resource-metrics.js';
import { chunkItems, mapWithConcurrency, withAwsServiceErrorContext } from './utils.js';

const NAT_GATEWAY_ARN_PREFIX = 'natgateway/';
const NAT_GATEWAY_DESCRIBE_BATCH_SIZE = 100;
const NAT_GATEWAY_DESCRIBE_CONCURRENCY = 2;
const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;
const DAILY_PERIOD_IN_SECONDS = 24 * 60 * 60;
const REQUIRED_NAT_GATEWAY_DAILY_POINTS = SEVEN_DAYS_IN_SECONDS / DAILY_PERIOD_IN_SECONDS;

const extractNatGatewayId = (resource: AwsDiscoveredResource): string | null => {
  if (resource.name?.startsWith('nat-')) {
    return resource.name;
  }

  const resourceSegment = resource.arn.split(':')[5];

  if (!resourceSegment?.startsWith(NAT_GATEWAY_ARN_PREFIX)) {
    return null;
  }

  return resourceSegment.slice(NAT_GATEWAY_ARN_PREFIX.length);
};

/**
 * Hydrates discovered NAT gateways with recent traffic totals.
 *
 * @param resources - Catalog resources filtered to NAT gateway resource types.
 * @returns Hydrated NAT gateway activity models for rule evaluation.
 */
export const hydrateAwsEc2NatGatewayActivity = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsEc2NatGatewayActivity[]> => {
  const resourcesByRegion = new Map<string, Array<{ accountId: string; natGatewayId: string }>>();

  for (const resource of resources) {
    const natGatewayId = extractNatGatewayId(resource);

    if (!natGatewayId) {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push({
      accountId: resource.accountId,
      natGatewayId,
    });
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const client = createEc2Client({ region });
      const natGateways: AwsEc2NatGatewayActivity[] = [];

      let metricIndex = 0;
      await collectResourceMetrics({
        ...cloudWatchWindow({
          endTime: new Date(getAwsDiscoveryTimestamp()),
          lookbackSeconds: SEVEN_DAYS_IN_SECONDS,
          mode: 'complete-days',
        }),
        region,
        produce: async (emit) => {
          await mapWithConcurrency(
            chunkItems(regionResources, NAT_GATEWAY_DESCRIBE_BATCH_SIZE),
            NAT_GATEWAY_DESCRIBE_CONCURRENCY,
            async (batch) => {
              const response = await withAwsServiceErrorContext('Amazon EC2', 'DescribeNatGateways', region, () =>
                client.send(
                  new DescribeNatGatewaysCommand({
                    NatGatewayIds: batch.map(({ natGatewayId }) => natGatewayId),
                  }),
                ),
              );

              const availableNatGateways = (response.NatGateways ?? []).flatMap((natGateway) => {
                if (
                  !natGateway.NatGatewayId ||
                  !natGateway.SubnetId ||
                  !natGateway.State ||
                  natGateway.State !== 'available'
                ) {
                  return [];
                }

                const discoveredResource = batch.find(({ natGatewayId }) => natGatewayId === natGateway.NatGatewayId);

                if (!discoveredResource) {
                  return [];
                }

                return [
                  {
                    accountId: discoveredResource.accountId,
                    natGatewayId: natGateway.NatGatewayId,
                    state: natGateway.State,
                    subnetId: natGateway.SubnetId,
                  },
                ];
              });

              for (const natGateway of availableNatGateways) {
                const index = metricIndex++;
                await emit(
                  [
                    {
                      dimensions: [{ Name: 'NatGatewayId', Value: natGateway.natGatewayId }],
                      id: `natIn${index}`,
                      metricName: 'BytesInFromDestination',
                      namespace: 'AWS/NATGateway',
                      period: DAILY_PERIOD_IN_SECONDS,
                      stat: 'Sum',
                    },
                    {
                      dimensions: [{ Name: 'NatGatewayId', Value: natGateway.natGatewayId }],
                      id: `natOut${index}`,
                      metricName: 'BytesOutToDestination',
                      namespace: 'AWS/NATGateway',
                      period: DAILY_PERIOD_IN_SECONDS,
                      stat: 'Sum',
                    },
                  ],
                  (metricData) => {
                    const inboundPoints = getCompleteCloudWatchPoints(metricData.get(`natIn${index}`)) ?? [];
                    const outboundPoints = getCompleteCloudWatchPoints(metricData.get(`natOut${index}`)) ?? [];

                    natGateways.push({
                      ...natGateway,
                      bytesInFromDestinationLast7Days:
                        inboundPoints.length >= REQUIRED_NAT_GATEWAY_DAILY_POINTS
                          ? inboundPoints.reduce((sum, point) => sum + point.value, 0)
                          : null,
                      bytesOutToDestinationLast7Days:
                        outboundPoints.length >= REQUIRED_NAT_GATEWAY_DAILY_POINTS
                          ? outboundPoints.reduce((sum, point) => sum + point.value, 0)
                          : null,
                      region,
                    });
                  },
                );
              }
            },
          );
        },
      });

      return natGateways;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.natGatewayId.localeCompare(right.natGatewayId));
};
