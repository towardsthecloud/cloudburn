import { DescribeTrailsCommand } from '@aws-sdk/client-cloudtrail';
import type { AwsCloudTrailTrail, AwsDiscoveredResource } from '@cloudburn/rules';
import { createCloudTrailClient } from '../client.js';
import { chunkItems, withAwsServiceErrorContext } from './utils.js';

const CLOUDTRAIL_DESCRIBE_BATCH_SIZE = 20;
const CLOUDTRAIL_TRAIL_ARN_PATTERN = /^arn:[^:]+:cloudtrail:[^:]+:[^:]+:trail\/(.+)$/u;

const extractTrailArn = (arn: string): string | null => (CLOUDTRAIL_TRAIL_ARN_PATTERN.test(arn) ? arn : null);

/**
 * Hydrates discovered CloudTrail trails with redundancy-related metadata.
 *
 * @param resources - Catalog resources filtered to CloudTrail trail resource types.
 * @returns Hydrated CloudTrail trail models for rule evaluation.
 */
export const hydrateAwsCloudTrailTrails = async (resources: AwsDiscoveredResource[]): Promise<AwsCloudTrailTrail[]> => {
  const resourcesByRegion = new Map<string, AwsDiscoveredResource[]>();

  for (const resource of resources) {
    const trailArn = extractTrailArn(resource.arn);

    if (!trailArn) {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push(resource);
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const trails: AwsCloudTrailTrail[] = [];
      const client = createCloudTrailClient({ region });
      const accountIdByTrailArn = new Map(
        regionResources.map((resource) => [resource.arn, resource.accountId] as const),
      );

      for (const batch of chunkItems(regionResources, CLOUDTRAIL_DESCRIBE_BATCH_SIZE)) {
        const response = await withAwsServiceErrorContext('AWS CloudTrail', 'DescribeTrails', region, () =>
          client.send(
            new DescribeTrailsCommand({
              includeShadowTrails: false,
              trailNameList: batch.map((resource) => resource.arn),
            }),
          ),
        );

        for (const trail of response.trailList ?? []) {
          if (!trail.TrailARN || !trail.Name || !trail.HomeRegion || trail.IsMultiRegionTrail === undefined) {
            continue;
          }

          trails.push({
            accountId: accountIdByTrailArn.get(trail.TrailARN) ?? '',
            homeRegion: trail.HomeRegion,
            isMultiRegionTrail: trail.IsMultiRegionTrail,
            isOrganizationTrail: trail.IsOrganizationTrail ?? false,
            region: trail.HomeRegion,
            trailArn: trail.TrailARN,
            trailName: trail.Name,
          });
        }
      }

      return trails.filter((trail) => trail.accountId.length > 0);
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.trailArn.localeCompare(right.trailArn));
};
