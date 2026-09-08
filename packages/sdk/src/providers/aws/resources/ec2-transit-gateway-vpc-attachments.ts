import {
  DescribeTransitGatewayAttachmentsCommand,
  DescribeTransitGatewayVpcAttachmentsCommand,
} from '@aws-sdk/client-ec2';
import type { AwsDiscoveredResource, AwsEc2TransitGatewayVpcAttachmentActivity } from '@cloudburn/rules';
import { createEc2Client } from '../client.js';
import { getAwsEvidenceTtl, isAwsEvidenceCacheEnabled, loadAwsCachedEvidence } from '../evidence.js';
import {
  emitAwsRequestTelemetry,
  getAwsDiscoveryTimestamp,
  getAwsExecutionSignal,
  throwIfAwsExecutionAborted,
} from '../execution.js';
import { fetchCloudWatchSignals, getCompleteCloudWatchPoints } from './cloudwatch.js';
import { chunkItems, extractTerminalArnResourceIdentifier, withAwsServiceErrorContext } from './utils.js';

const TRANSIT_GATEWAY_ATTACHMENT_DESCRIBE_BATCH_SIZE = 100;
const LOOKBACK_DAYS = 30 as const;
const DAILY_PERIOD_SECONDS = 24 * 60 * 60;
const LOOKBACK_SECONDS = LOOKBACK_DAYS * DAILY_PERIOD_SECONDS;
const ESTIMATED_MONTHLY_HOURS = 730;
const PRICE_LIST_TIMEOUT_MS = 5_000;
const PRICE_LIST_TTL_MS = 12 * 60 * 60 * 1_000;
const PRICE_DATASET_KEY = 'public-pricing:AmazonVPC:TransitGatewayVPC';

type VpcAttachmentPrice = {
  hourlyCostUsd: number;
  sourceVersion?: string;
  publicationDate?: string;
};

type PriceListProduct = {
  attributes?: Record<string, string>;
};

type PriceDimension = {
  pricePerUnit?: { USD?: string };
  unit?: string;
};

type PriceList = {
  version?: string;
  publicationDate?: string;
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
      if (['hour', 'hrs'].includes(dimension.unit?.toLowerCase() ?? '') && Number.isFinite(price) && price >= 0) {
        return price;
      }
    }
  }

  return null;
};

const fetchVpcAttachmentPrice = async (region: string): Promise<VpcAttachmentPrice | null> => {
  throwIfAwsExecutionAborted();
  const executionSignal = getAwsExecutionSignal();
  const timeoutSignal = AbortSignal.timeout(PRICE_LIST_TIMEOUT_MS);
  const signal = executionSignal ? AbortSignal.any([executionSignal, timeoutSignal]) : timeoutSignal;
  const startedAtMs = Date.now();
  let statusCode: number | undefined;
  let outcome = 'unavailable';
  try {
    const response = await fetch(
      `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonVPC/current/${encodeURIComponent(region)}/index.json`,
      { signal },
    );
    statusCode = response.status;
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }

    const priceList = (await response.json()) as PriceList;
    throwIfAwsExecutionAborted();
    const price = readHourlyVpcAttachmentPrice(priceList, region);
    outcome = price === null ? 'unavailable' : 'success';
    return price === null
      ? null
      : {
          hourlyCostUsd: price,
          ...(typeof priceList.version === 'string' ? { sourceVersion: priceList.version } : {}),
          ...(typeof priceList.publicationDate === 'string' && Number.isFinite(Date.parse(priceList.publicationDate))
            ? { publicationDate: new Date(priceList.publicationDate).toISOString() }
            : {}),
        };
  } catch {
    throwIfAwsExecutionAborted();
    return null;
  } finally {
    emitAwsRequestTelemetry({
      service: 'AWS Public Pricing',
      operation: 'GetPublicPriceList',
      region,
      durationMs: Date.now() - startedAtMs,
      outcome: executionSignal?.aborted ? 'cancelled' : outcome,
      ...(statusCode === undefined ? {} : { statusCode }),
    });
  }
};

const loadHourlyVpcAttachmentPrice = async (region: string): Promise<number | null> => {
  if (!isAwsEvidenceCacheEnabled(true)) return (await fetchVpcAttachmentPrice(region))?.hourlyCostUsd ?? null;
  try {
    const result = await loadAwsCachedEvidence({
      datasetKey: PRICE_DATASET_KEY,
      region,
      public: true,
      key: {
        kind: 'public-pricing',
        offer: 'AmazonVPC',
        operation: 'TransitGatewayVPC',
        attachmentType: 'VPC',
        region,
        currency: 'USD',
        versionPolicy: 'current-v1',
      },
      ttlMs: getAwsEvidenceTtl(PRICE_DATASET_KEY, PRICE_LIST_TTL_MS),
      load: async () => {
        const value = await fetchVpcAttachmentPrice(region);
        return {
          value,
          complete: value !== null,
          ...(value?.publicationDate ? { observedAt: value.publicationDate } : {}),
        };
      },
      validate: (value): value is VpcAttachmentPrice | null =>
        value !== null &&
        typeof value === 'object' &&
        'hourlyCostUsd' in value &&
        typeof value.hourlyCostUsd === 'number' &&
        Number.isFinite(value.hourlyCostUsd) &&
        value.hourlyCostUsd >= 0,
    });
    return result.value?.hourlyCostUsd ?? null;
  } catch {
    throwIfAwsExecutionAborted();
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
        const attachmentResponse = await withAwsServiceErrorContext(
          'Amazon EC2',
          'DescribeTransitGatewayAttachments',
          region,
          () =>
            client.send(
              new DescribeTransitGatewayAttachmentsCommand({
                Filters: [{ Name: 'resource-type', Values: ['vpc'] }],
                TransitGatewayAttachmentIds: batch.map(({ transitGatewayAttachmentId }) => transitGatewayAttachmentId),
              }),
            ),
        );
        const vpcAttachmentIds = new Set(
          (attachmentResponse.TransitGatewayAttachments ?? []).flatMap((attachment) =>
            attachment.ResourceType === 'vpc' && attachment.TransitGatewayAttachmentId
              ? [attachment.TransitGatewayAttachmentId]
              : [],
          ),
        );
        const vpcBatch = batch.filter(({ transitGatewayAttachmentId }) =>
          vpcAttachmentIds.has(transitGatewayAttachmentId),
        );
        if (vpcBatch.length === 0) {
          continue;
        }

        const response = await withAwsServiceErrorContext(
          'Amazon EC2',
          'DescribeTransitGatewayVpcAttachments',
          region,
          () =>
            client.send(
              new DescribeTransitGatewayVpcAttachmentsCommand({
                TransitGatewayAttachmentIds: vpcBatch.map(
                  ({ transitGatewayAttachmentId }) => transitGatewayAttachmentId,
                ),
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

          const discoveredResource = vpcBatch.find(
            ({ transitGatewayAttachmentId }) => transitGatewayAttachmentId === attachment.TransitGatewayAttachmentId,
          );
          if (!discoveredResource) {
            return [];
          }

          return [
            {
              accountId: discoveredResource.accountId,
              creationTime: attachment.CreationTime ?? null,
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

        const endTime = new Date(getAwsDiscoveryTimestamp());
        endTime.setUTCHours(0, 0, 0, 0);
        const startTime = new Date(endTime.getTime() - LOOKBACK_SECONDS * 1_000);
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
            startTime,
          }),
          hourlyAttachmentCostPromise,
        ]);

        attachments.push(
          ...availableAttachments.map((attachment, index) => {
            const inboundPoints = getCompleteCloudWatchPoints(metricData.get(`tgwIn${index}`)) ?? [];
            const outboundPoints = getCompleteCloudWatchPoints(metricData.get(`tgwOut${index}`)) ?? [];
            const hasCompleteLookback =
              attachment.creationTime !== null && attachment.creationTime.getTime() <= startTime.getTime();
            return {
              accountId: attachment.accountId,
              bytesInLast30Days:
                hasCompleteLookback && inboundPoints.length >= LOOKBACK_DAYS
                  ? inboundPoints.reduce((sum, point) => sum + point.value, 0)
                  : null,
              bytesOutLast30Days:
                hasCompleteLookback && outboundPoints.length >= LOOKBACK_DAYS
                  ? outboundPoints.reduce((sum, point) => sum + point.value, 0)
                  : null,
              estimatedMonthlyAttachmentCostUsd:
                hourlyAttachmentCostUsd === null
                  ? null
                  : Number((hourlyAttachmentCostUsd * ESTIMATED_MONTHLY_HOURS).toFixed(2)),
              hourlyAttachmentCostUsd,
              lookbackDays: LOOKBACK_DAYS,
              region,
              state: attachment.state,
              transitGatewayAttachmentId: attachment.transitGatewayAttachmentId,
              transitGatewayId: attachment.transitGatewayId,
              vpcId: attachment.vpcId,
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
