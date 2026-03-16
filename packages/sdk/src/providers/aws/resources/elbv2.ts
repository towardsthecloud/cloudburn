import { DescribeLoadBalancersCommand } from '@aws-sdk/client-elastic-load-balancing';
import {
  DescribeLoadBalancersCommand as DescribeLoadBalancersV2Command,
  DescribeTargetGroupsCommand,
  DescribeTargetHealthCommand,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import type { AwsDiscoveredResource, AwsEc2LoadBalancer, AwsEc2TargetGroup } from '@cloudburn/rules';
import { createElasticLoadBalancingClient, createElasticLoadBalancingV2Client } from '../client.js';
import { chunkItems, withAwsServiceErrorContext } from './utils.js';

const CLASSIC_LOAD_BALANCER_ARN_PREFIX = 'loadbalancer/';
const TARGET_GROUP_ARN_PREFIX = 'targetgroup/';
const CLASSIC_LOAD_BALANCER_BATCH_SIZE = 20;
const V2_LOAD_BALANCER_BATCH_SIZE = 20;
const TARGET_GROUP_BATCH_SIZE = 20;

const inferClassicLoadBalancerName = (resource: AwsDiscoveredResource): string | null => {
  if (resource.name) {
    return resource.name;
  }

  const arnSegments = resource.arn.split(':');
  const resourceSegment = arnSegments[5];

  if (!resourceSegment?.startsWith(CLASSIC_LOAD_BALANCER_ARN_PREFIX)) {
    return null;
  }

  const resourceName = resourceSegment.slice(CLASSIC_LOAD_BALANCER_ARN_PREFIX.length);

  return resourceName.length > 0 ? resourceName : null;
};

const isClassicLoadBalancerResource = (resource: AwsDiscoveredResource): boolean =>
  resource.resourceType === 'elasticloadbalancing:loadbalancer';

const isV2LoadBalancerResource = (resource: AwsDiscoveredResource): boolean =>
  resource.resourceType.startsWith('elasticloadbalancing:loadbalancer/');

const extractTargetGroupArn = (resource: AwsDiscoveredResource): string | null => {
  const arnSegments = resource.arn.split(':');
  const resourceSegment = arnSegments[5];

  if (!resourceSegment?.startsWith(TARGET_GROUP_ARN_PREFIX)) {
    return null;
  }

  return resource.arn;
};

const isLoadBalancerMissingError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'LoadBalancerNotFound' ||
    error.name === 'LoadBalancerNotFoundException' ||
    error.message.includes('LoadBalancerNotFound'));

const isClassicLoadBalancerMissingError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'AccessPointNotFound' ||
    error.name === 'AccessPointNotFoundException' ||
    error.message.includes('AccessPointNotFound'));

const isTargetGroupMissingError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'TargetGroupNotFound' ||
    error.name === 'TargetGroupNotFoundException' ||
    error.message.includes('TargetGroupNotFound'));

const describeClassicLoadBalancersSafely = async (options: {
  client: ReturnType<typeof createElasticLoadBalancingClient>;
  classicResources: Array<{ accountId: string; arn: string; name: string }>;
  region: string;
}) => {
  try {
    const response = await withAwsServiceErrorContext(
      'Elastic Load Balancing',
      'DescribeLoadBalancers',
      options.region,
      () =>
        options.client.send(
          new DescribeLoadBalancersCommand({
            LoadBalancerNames: options.classicResources.map((resource) => resource.name),
          }),
        ),
      {
        passthrough: isClassicLoadBalancerMissingError,
      },
    );

    return response.LoadBalancerDescriptions ?? [];
  } catch (error) {
    if (!isClassicLoadBalancerMissingError(error)) {
      throw error;
    }

    const loadBalancers = [];

    // Resource Explorer can lag deletions, so retry individual names and keep the survivors.
    for (const resource of options.classicResources) {
      try {
        const response = await withAwsServiceErrorContext(
          'Elastic Load Balancing',
          'DescribeLoadBalancers',
          options.region,
          () =>
            options.client.send(
              new DescribeLoadBalancersCommand({
                LoadBalancerNames: [resource.name],
              }),
            ),
          {
            passthrough: isClassicLoadBalancerMissingError,
          },
        );
        loadBalancers.push(...(response.LoadBalancerDescriptions ?? []));
      } catch (innerError) {
        if (!isClassicLoadBalancerMissingError(innerError)) {
          throw innerError;
        }
      }
    }

    return loadBalancers;
  }
};

const describeV2LoadBalancersSafely = async (options: {
  client: ReturnType<typeof createElasticLoadBalancingV2Client>;
  region: string;
  loadBalancerArns: string[];
}) => {
  try {
    const response = await withAwsServiceErrorContext(
      'Elastic Load Balancing v2',
      'DescribeLoadBalancers',
      options.region,
      () =>
        options.client.send(
          new DescribeLoadBalancersV2Command({
            LoadBalancerArns: options.loadBalancerArns,
          }),
        ),
      {
        passthrough: isLoadBalancerMissingError,
      },
    );

    return response.LoadBalancers ?? [];
  } catch (error) {
    if (!isLoadBalancerMissingError(error)) {
      throw error;
    }

    const loadBalancers = [];

    for (const loadBalancerArn of options.loadBalancerArns) {
      try {
        const response = await withAwsServiceErrorContext(
          'Elastic Load Balancing v2',
          'DescribeLoadBalancers',
          options.region,
          () =>
            options.client.send(
              new DescribeLoadBalancersV2Command({
                LoadBalancerArns: [loadBalancerArn],
              }),
            ),
          {
            passthrough: isLoadBalancerMissingError,
          },
        );
        loadBalancers.push(...(response.LoadBalancers ?? []));
      } catch (innerError) {
        if (!isLoadBalancerMissingError(innerError)) {
          throw innerError;
        }
      }
    }

    return loadBalancers;
  }
};

const loadTargetGroupArnsByLoadBalancer = async (
  region: string,
  loadBalancerArns: string[],
): Promise<Map<string, string[]>> => {
  const client = createElasticLoadBalancingV2Client({ region });
  const targetGroupArnsByLoadBalancer = new Map<string, string[]>();

  for (const loadBalancerArn of loadBalancerArns) {
    try {
      const response = await withAwsServiceErrorContext(
        'Elastic Load Balancing v2',
        'DescribeTargetGroups',
        region,
        () =>
          client.send(
            new DescribeTargetGroupsCommand({
              LoadBalancerArn: loadBalancerArn,
            }),
          ),
        {
          passthrough: isLoadBalancerMissingError,
        },
      );

      targetGroupArnsByLoadBalancer.set(
        loadBalancerArn,
        (response.TargetGroups ?? []).flatMap((targetGroup) =>
          targetGroup.TargetGroupArn ? [targetGroup.TargetGroupArn] : [],
        ),
      );
    } catch (error) {
      if (!isLoadBalancerMissingError(error)) {
        throw error;
      }
    }
  }

  return targetGroupArnsByLoadBalancer;
};

const describeTargetGroupsSafely = async (options: {
  client: ReturnType<typeof createElasticLoadBalancingV2Client>;
  region: string;
  targetGroupArns: string[];
}) => {
  try {
    const response = await withAwsServiceErrorContext(
      'Elastic Load Balancing v2',
      'DescribeTargetGroups',
      options.region,
      () =>
        options.client.send(
          new DescribeTargetGroupsCommand({
            TargetGroupArns: options.targetGroupArns,
          }),
        ),
      {
        passthrough: isTargetGroupMissingError,
      },
    );

    return response.TargetGroups ?? [];
  } catch (error) {
    if (!isTargetGroupMissingError(error)) {
      throw error;
    }

    const targetGroups = [];

    // Resource Explorer can return stale target groups, so retry per ARN and skip the missing ones.
    for (const targetGroupArn of options.targetGroupArns) {
      try {
        const response = await withAwsServiceErrorContext(
          'Elastic Load Balancing v2',
          'DescribeTargetGroups',
          options.region,
          () =>
            options.client.send(
              new DescribeTargetGroupsCommand({
                TargetGroupArns: [targetGroupArn],
              }),
            ),
          {
            passthrough: isTargetGroupMissingError,
          },
        );
        targetGroups.push(...(response.TargetGroups ?? []));
      } catch (innerError) {
        if (!isTargetGroupMissingError(innerError)) {
          throw innerError;
        }
      }
    }

    return targetGroups;
  }
};

/**
 * Hydrates discovered load balancers with attached target groups or instance counts.
 *
 * @param resources - Catalog resources filtered to ELB resource types.
 * @returns Hydrated load balancers for rule evaluation.
 */
export const hydrateAwsEc2LoadBalancers = async (resources: AwsDiscoveredResource[]): Promise<AwsEc2LoadBalancer[]> => {
  const resourcesByRegion = new Map<string, AwsDiscoveredResource[]>();

  for (const resource of resources) {
    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push(resource);
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const classicResources = regionResources.filter(isClassicLoadBalancerResource).flatMap((resource) => {
        const name = inferClassicLoadBalancerName(resource);

        return name ? [{ accountId: resource.accountId, arn: resource.arn, name }] : [];
      });
      const v2Resources = regionResources.filter(isV2LoadBalancerResource);
      const loadBalancers: AwsEc2LoadBalancer[] = [];

      if (classicResources.length > 0) {
        const client = createElasticLoadBalancingClient({ region });

        for (const batch of chunkItems(classicResources, CLASSIC_LOAD_BALANCER_BATCH_SIZE)) {
          const classicResourceByName = new Map(batch.map((resource) => [resource.name, resource] as const));

          for (const loadBalancer of await describeClassicLoadBalancersSafely({
            classicResources: batch,
            client,
            region,
          })) {
            if (!loadBalancer.LoadBalancerName) {
              continue;
            }

            const discoveredResource = classicResourceByName.get(loadBalancer.LoadBalancerName);

            if (!discoveredResource) {
              continue;
            }

            loadBalancers.push({
              accountId: discoveredResource.accountId,
              attachedTargetGroupArns: [],
              instanceCount: (loadBalancer.Instances ?? []).length,
              loadBalancerArn: discoveredResource.arn,
              loadBalancerName: loadBalancer.LoadBalancerName,
              loadBalancerType: 'classic',
              region,
            });
          }
        }
      }

      if (v2Resources.length > 0) {
        const client = createElasticLoadBalancingV2Client({ region });
        const accountIdByLoadBalancerArn = new Map(
          v2Resources.map((resource) => [resource.arn, resource.accountId] as const),
        );
        const targetGroupArnsByLoadBalancer = await loadTargetGroupArnsByLoadBalancer(
          region,
          v2Resources.map((resource) => resource.arn),
        );

        for (const batch of chunkItems(v2Resources, V2_LOAD_BALANCER_BATCH_SIZE)) {
          const describedLoadBalancers = await describeV2LoadBalancersSafely({
            client,
            loadBalancerArns: batch.map((resource) => resource.arn),
            region,
          });

          for (const loadBalancer of describedLoadBalancers) {
            if (!loadBalancer.LoadBalancerArn || !loadBalancer.LoadBalancerName || !loadBalancer.Type) {
              continue;
            }

            const accountId = accountIdByLoadBalancerArn.get(loadBalancer.LoadBalancerArn);

            if (!accountId) {
              continue;
            }

            loadBalancers.push({
              accountId,
              attachedTargetGroupArns: targetGroupArnsByLoadBalancer.get(loadBalancer.LoadBalancerArn) ?? [],
              instanceCount: 0,
              loadBalancerArn: loadBalancer.LoadBalancerArn,
              loadBalancerName: loadBalancer.LoadBalancerName,
              loadBalancerType: loadBalancer.Type,
              region,
            });
          }
        }
      }

      return loadBalancers;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.loadBalancerArn.localeCompare(right.loadBalancerArn));
};

/**
 * Hydrates discovered target groups with their attached load balancers and target counts.
 *
 * @param resources - Catalog resources filtered to ELB target-group resource types.
 * @returns Hydrated target groups for rule evaluation.
 */
export const hydrateAwsEc2TargetGroups = async (resources: AwsDiscoveredResource[]): Promise<AwsEc2TargetGroup[]> => {
  const resourcesByRegion = new Map<string, Array<{ accountId: string; targetGroupArn: string }>>();

  for (const resource of resources) {
    const targetGroupArn = extractTargetGroupArn(resource);

    if (!targetGroupArn) {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push({
      accountId: resource.accountId,
      targetGroupArn,
    });
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const client = createElasticLoadBalancingV2Client({ region });
      const targetGroups: AwsEc2TargetGroup[] = [];

      for (const batch of chunkItems(regionResources, TARGET_GROUP_BATCH_SIZE)) {
        const accountIdByTargetGroupArn = new Map(
          batch.map((resource) => [resource.targetGroupArn, resource.accountId] as const),
        );

        const hydratedBatch = await Promise.all(
          (
            await describeTargetGroupsSafely({
              client,
              region,
              targetGroupArns: batch.map((resource) => resource.targetGroupArn),
            })
          ).flatMap((targetGroup) => {
            const targetGroupArn = targetGroup.TargetGroupArn;

            if (!targetGroupArn) {
              return [];
            }

            return [
              (async (): Promise<AwsEc2TargetGroup | null> => {
                const accountId = accountIdByTargetGroupArn.get(targetGroupArn);

                if (!accountId) {
                  return null;
                }

                const targetHealth = await withAwsServiceErrorContext(
                  'Elastic Load Balancing v2',
                  'DescribeTargetHealth',
                  region,
                  () =>
                    client.send(
                      new DescribeTargetHealthCommand({
                        TargetGroupArn: targetGroupArn,
                      }),
                    ),
                );

                return {
                  accountId,
                  loadBalancerArns: targetGroup.LoadBalancerArns ?? [],
                  region,
                  registeredTargetCount: (targetHealth.TargetHealthDescriptions ?? []).length,
                  targetGroupArn,
                };
              })(),
            ];
          }),
        );

        targetGroups.push(...hydratedBatch.flatMap((targetGroup) => (targetGroup ? [targetGroup] : [])));
      }

      return targetGroups;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.targetGroupArn.localeCompare(right.targetGroupArn));
};
