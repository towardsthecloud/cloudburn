import { GetDistributionCommand, ListDistributionsCommand } from '@aws-sdk/client-cloudfront';
import type { AwsCloudFrontDistribution, AwsDiscoveredResource } from '@cloudburn/rules';
import { createCloudFrontClient, resolveAwsAccountId } from '../client.js';
import { chunkItems, extractTerminalArnResourceIdentifier, withAwsServiceErrorContext } from './utils.js';

const CLOUDFRONT_DISTRIBUTION_CONCURRENCY = 10;
const CLOUDFRONT_CONTROL_REGION = 'us-east-1';

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
