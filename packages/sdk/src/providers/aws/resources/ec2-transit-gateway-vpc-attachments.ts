import { DescribeTransitGatewayVpcAttachmentsCommand } from '@aws-sdk/client-ec2';
import type { AwsDiscoveredResource, AwsEc2TransitGatewayVpcAttachmentActivity } from '@cloudburn/rules';
import { createEc2Client } from '../client.js';
import { fetchCloudWatchSignals } from './cloudwatch.js';
import { chunkItems, extractTerminalArnResourceIdentifier, withAwsServiceErrorContext } from './utils.js';

const TRANSIT_GATEWAY_ATTACHMENT_DESCRIBE_BATCH_SIZE = 100;
const LOOKBACK_DAYS = 30 as const;
const DAILY_PERIOD_SECONDS = 24 * 60 * 60;
const LOOKBACK_SECONDS = LOOKBACK_DAYS * DAILY_PERIOD_SECONDS;
const ESTIMATED_MONTHLY_HOURS = 730;
const PRICE_LIST_TIMEOUT_MS = 5_000;

type PriceListProduct = {
  attributes?: Record<string, string>;
};

type PriceDimension = {
  pricePerUnit?: { USD?: string };
  unit?: string;
};

type PriceList = {
  products?: Record<string, PriceListProduct>;
  terms?: {
    OnDemand?: Record<string, Record<string, { priceDimensions?: Record<string, PriceDimension> }>>;
  };
};

const extractTransitGatewayAttachmentId = (resource: AwsDiscoveredResource): string | null => {
  if (resource.name?.startsWith('tgw-attach-')) {
    return resource.name;
  }

  const resourceIdentifier = extractTerminalArnResourceIdentifier(resource.arn);

  return resourceIdentifier?.startsWith('tgw-attach-') ? resourceIdentifier : null;
};

const readHourlyVpcAttachmentPrice = (priceList: PriceList, region: string): number | null => {
  const productEntry = Object.entries(priceList.products ?? {}).find(([, product]) => {
    const attributes = product.attributes;
    return (
      attributes?.attachmentType === 'VPC' &&
      attributes.group === 'AWSTransitGateway' &&
      attributes.operation === 'TransitGatewayVPC' &&
      attributes.regionCode === region &&
      attributes.usagetype?.endsWith('TransitGateway-Hours')
    );
  });
  if (!productEntry) {
    return null;
  }

  const [sku] = productEntry;
  for (const term of Object.values(priceList.terms?.OnDemand?.[sku] ?? {})) {
    for (const dimension of Object.values(term.priceDimensions ?? {})) {
      const price = Number.parseFloat(dimension.pricePerUnit?.USD ?? '');
      if (dimension.unit === 'hour' && Number.isFinite(price) && price >= 0) {
        return price;
      }
    }
  }

  return null;
};

const loadHourlyVpcAttachmentPrice = async (region: string): Promise<number | null> => {
  try {
    const response = await fetch(
      `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonVPC/current/${encodeURIComponent(region)}/index.json`,
      { signal: AbortSignal.timeout(PRICE_LIST_TIMEOUT_MS) },
    );
    if (!response.ok) {
      return null;
    }

    return readHourlyVpcAttachmentPrice((await response.json()) as PriceList, region);
  } catch {
    return null;
  }
};

/**
 * Hydrates Resource Explorer Transit Gateway VPC attachments with complete traffic and public pricing evidence.
 *
 * @param resources - Catalog resources filtered to Transit Gateway attachment resource types.
 * @returns Available VPC attachments with normalized 30-day activity and optional recurring-cost estimates.
 */
export const hydrateAwsEc2TransitGatewayVpcAttachmentActivity = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsEc2TransitGatewayVpcAttachmentActivity[]> => {
  const resourcesByRegion = new Map<string, Array<{ accountId: string; transitGatewayAttachmentId: string }>>();

  for (const resource of resources) {
    const transitGatewayAttachmentId = extractTransitGatewayAttachmentId(resource);
    if (!transitGatewayAttachmentId) {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push({ accountId: resource.accountId, transitGatewayAttachmentId });
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const client = createEc2Client({ region });
      const attachments: AwsEc2TransitGatewayVpcAttachmentActivity[] = [];
      let hourlyAttachmentCostPromise: Promise<number | null> | undefined;

      for (const batch of chunkItems(regionResources, TRANSIT_GATEWAY_ATTACHMENT_DESCRIBE_BATCH_SIZE)) {
        const response = await withAwsServiceErrorContext(
          'Amazon EC2',
          'DescribeTransitGatewayVpcAttachments',
          region,
          () =>
            client.send(
              new DescribeTransitGatewayVpcAttachmentsCommand({
                TransitGatewayAttachmentIds: batch.map(({ transitGatewayAttachmentId }) => transitGatewayAttachmentId),
              }),
            ),
        );

        const availableAttachments = (response.TransitGatewayVpcAttachments ?? []).flatMap((attachment) => {
          if (
            attachment.State !== 'available' ||
            !attachment.TransitGatewayAttachmentId ||
            !attachment.TransitGatewayId ||
            !attachment.VpcId
          ) {
            return [];
          }

          const discoveredResource = batch.find(
            ({ transitGatewayAttachmentId }) => transitGatewayAttachmentId === attachment.TransitGatewayAttachmentId,
          );
          if (!discoveredResource) {
            return [];
          }

          return [
            {
              accountId: discoveredResource.accountId,
              state: attachment.State,
              transitGatewayAttachmentId: attachment.TransitGatewayAttachmentId,
              transitGatewayId: attachment.TransitGatewayId,
              vpcId: attachment.VpcId,
            },
          ];
        });
        if (availableAttachments.length === 0) {
          continue;
        }

        const endTime = new Date();
        endTime.setUTCHours(0, 0, 0, 0);
        hourlyAttachmentCostPromise ??= loadHourlyVpcAttachmentPrice(region);
        const [metricData, hourlyAttachmentCostUsd] = await Promise.all([
          fetchCloudWatchSignals({
            endTime,
            queries: availableAttachments.flatMap((attachment, index) => {
              const dimensions = [
                {
                  Name: 'TransitGateway',
                  Value: attachment.transitGatewayId,
                },
                {
                  Name: 'TransitGatewayAttachment',
                  Value: attachment.transitGatewayAttachmentId,
                },
              ];

              return [
                {
                  dimensions,
                  id: `tgwIn${index}`,
                  metricName: 'BytesIn',
                  namespace: 'AWS/TransitGateway',
                  period: DAILY_PERIOD_SECONDS,
                  stat: 'Sum' as const,
                },
                {
                  dimensions,
                  id: `tgwOut${index}`,
                  metricName: 'BytesOut',
                  namespace: 'AWS/TransitGateway',
                  period: DAILY_PERIOD_SECONDS,
                  stat: 'Sum' as const,
                },
              ];
            }),
            region,
            startTime: new Date(endTime.getTime() - LOOKBACK_SECONDS * 1_000),
          }),
          hourlyAttachmentCostPromise,
        ]);

        attachments.push(
          ...availableAttachments.map((attachment, index) => {
            const inboundPoints = metricData.get(`tgwIn${index}`) ?? [];
            const outboundPoints = metricData.get(`tgwOut${index}`) ?? [];
            return {
              ...attachment,
              bytesInLast30Days:
                inboundPoints.length >= LOOKBACK_DAYS
                  ? inboundPoints.reduce((sum, point) => sum + point.value, 0)
                  : null,
              bytesOutLast30Days:
                outboundPoints.length >= LOOKBACK_DAYS
                  ? outboundPoints.reduce((sum, point) => sum + point.value, 0)
                  : null,
              estimatedMonthlyAttachmentCostUsd:
                hourlyAttachmentCostUsd === null
                  ? null
                  : Number((hourlyAttachmentCostUsd * ESTIMATED_MONTHLY_HOURS).toFixed(2)),
              hourlyAttachmentCostUsd,
              lookbackDays: LOOKBACK_DAYS,
              region,
            } satisfies AwsEc2TransitGatewayVpcAttachmentActivity;
          }),
        );
      }

      return attachments;
    }),
  );

  return hydratedPages
    .flat()
    .sort((left, right) => left.transitGatewayAttachmentId.localeCompare(right.transitGatewayAttachmentId));
};
