import { GetDistributionCommand, ListDistributionsCommand } from '@aws-sdk/client-cloudfront';
import type {
  AwsCloudFrontDistribution,
  AwsCloudFrontDistributionRequestActivity,
  AwsDiscoveredResource,
} from '@cloudburn/rules';
import { createCloudFrontClient, resolveAwsAccountId } from '../client.js';
import type { AwsDiscoveryDatasetLoadContext } from '../discovery-registry.js';
import { fetchCloudWatchSignals } from './cloudwatch.js';
import { chunkItems, extractTerminalArnResourceIdentifier, withAwsServiceErrorContext } from './utils.js';

const CLOUDFRONT_DISTRIBUTION_CONCURRENCY = 10;
const CLOUDFRONT_CONTROL_REGION = 'us-east-1';
const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;
const DAILY_PERIOD_IN_SECONDS = 24 * 60 * 60;
const REQUIRED_CLOUDFRONT_DAILY_POINTS = THIRTY_DAYS_IN_SECONDS / DAILY_PERIOD_IN_SECONDS;

const listDistributionSeeds = async (): Promise<
  Array<Pick<AwsCloudFrontDistribution, 'distributionArn' | 'distributionId'>>
> => {
  const client = createCloudFrontClient();
  const distributions: Array<Pick<AwsCloudFrontDistribution, 'distributionArn' | 'distributionId'>> = [];
  let marker: string | undefined;

  do {
    const response = await withAwsServiceErrorContext(
      'Amazon CloudFront',
      'ListDistributions',
      CLOUDFRONT_CONTROL_REGION,
      () =>
        client.send(
          new ListDistributionsCommand({
            Marker: marker,
          }),
        ),
    );

    for (const distribution of response.DistributionList?.Items ?? []) {
      if (!distribution.ARN || !distribution.Id) {
        continue;
      }

      distributions.push({
        distributionArn: distribution.ARN,
        distributionId: distribution.Id,
      });
    }

    marker = response.DistributionList?.NextMarker;
  } while (marker);

  return distributions;
};

/**
 * Hydrates discovered CloudFront distributions with price-class metadata.
 *
 * @param resources - Optional catalog resources filtered to CloudFront distributions.
 * @returns Hydrated CloudFront distributions for rule evaluation.
 */
export const hydrateAwsCloudFrontDistributions = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsCloudFrontDistribution[]> => {
  const distributionSeeds =
    resources.length > 0
      ? resources.flatMap((resource) => {
          const distributionId = extractTerminalArnResourceIdentifier(resource.arn);

          return distributionId
            ? [
                {
                  accountId: resource.accountId,
                  distributionArn: resource.arn,
                  distributionId,
                  region: resource.region,
                },
              ]
            : [];
        })
      : (([distributions, accountId]) =>
          distributions.map((distribution) => ({
            accountId,
            distributionArn: distribution.distributionArn,
            distributionId: distribution.distributionId,
            region: 'global',
          })))(await Promise.all([listDistributionSeeds(), resolveAwsAccountId()]));
  const uniqueSeeds = [
    ...new Map(distributionSeeds.map((distribution) => [distribution.distributionId, distribution])).values(),
  ];
  const client = createCloudFrontClient();
  const distributions: AwsCloudFrontDistribution[] = [];

  for (const batch of chunkItems(uniqueSeeds, CLOUDFRONT_DISTRIBUTION_CONCURRENCY)) {
    const hydratedBatch = await Promise.all(
      batch.map(async (distribution) => {
        const response = await withAwsServiceErrorContext(
          'Amazon CloudFront',
          'GetDistribution',
          CLOUDFRONT_CONTROL_REGION,
          () =>
            client.send(
              new GetDistributionCommand({
                Id: distribution.distributionId,
              }),
            ),
        );

        return {
          accountId: distribution.accountId,
          distributionArn: distribution.distributionArn,
          distributionId: distribution.distributionId,
          priceClass: response.Distribution?.DistributionConfig?.PriceClass,
          region: distribution.region,
        } satisfies AwsCloudFrontDistribution;
      }),
    );

    distributions.push(...hydratedBatch);
  }

  return distributions.sort((left, right) => left.distributionArn.localeCompare(right.distributionArn));
};

/**
 * Hydrates discovered CloudFront distributions with 30-day request totals.
 *
 * @param resources - Optional catalog resources filtered to CloudFront distributions.
 * @returns Request activity coverage for CloudFront distributions.
 */
export const hydrateAwsCloudFrontDistributionRequestActivity = async (
  resources: AwsDiscoveredResource[],
  context?: AwsDiscoveryDatasetLoadContext,
): Promise<AwsCloudFrontDistributionRequestActivity[]> => {
  const distributions = context
    ? await context.loadDataset('aws-cloudfront-distributions')
    : await hydrateAwsCloudFrontDistributions(resources);

  if (distributions.length === 0) {
    return [];
  }

  const metricData = await fetchCloudWatchSignals({
    endTime: new Date(),
    queries: distributions.map((distribution, index) => ({
      dimensions: [
        { Name: 'DistributionId', Value: distribution.distributionId },
        { Name: 'Region', Value: 'Global' },
      ],
      id: `distribution${index}`,
      metricName: 'Requests',
      namespace: 'AWS/CloudFront',
      period: DAILY_PERIOD_IN_SECONDS,
      stat: 'Sum' as const,
    })),
    region: CLOUDFRONT_CONTROL_REGION,
    startTime: new Date(Date.now() - THIRTY_DAYS_IN_SECONDS * 1000),
  });

  return distributions.map((distribution, index) => {
    const requestPoints = metricData.get(`distribution${index}`) ?? [];

    return {
      accountId: distribution.accountId,
      distributionArn: distribution.distributionArn,
      distributionId: distribution.distributionId,
      region: distribution.region,
      totalRequestsLast30Days:
        requestPoints.length >= REQUIRED_CLOUDFRONT_DAILY_POINTS
          ? requestPoints.reduce((sum, point) => sum + point.value, 0)
          : null,
    } satisfies AwsCloudFrontDistributionRequestActivity;
  });
};
