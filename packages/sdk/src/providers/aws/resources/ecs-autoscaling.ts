import {
  DescribeScalableTargetsCommand,
  DescribeScalingPoliciesCommand,
} from '@aws-sdk/client-application-auto-scaling';
import type { AwsDiscoveredResource, AwsEcsServiceAutoscaling } from '@cloudburn/rules';
import { createApplicationAutoScalingClient } from '../client.js';
import { chunkItems, withAwsServiceErrorContext } from './utils.js';

const APPLICATION_AUTO_SCALING_BATCH_SIZE = 50;

type ParsedEcsAutoscalingService = {
  serviceArn: string;
  clusterName: string;
  serviceName: string;
  resourceId: string;
};

const parseEcsAutoscalingService = (arn: string): ParsedEcsAutoscalingService | null => {
  const arnSegments = arn.split(':');
  const resourceSegment = arnSegments[5];

  if (!resourceSegment?.startsWith('service/')) {
    return null;
  }

  const resourceParts = resourceSegment.split('/');

  if (resourceParts.length < 3) {
    return null;
  }

  const clusterName = resourceParts[1];
  const serviceName = resourceParts[2];

  return clusterName && serviceName
    ? {
        clusterName,
        resourceId: `service/${clusterName}/${serviceName}`,
        serviceArn: arn,
        serviceName,
      }
    : null;
};

/**
 * Hydrates discovered ECS services with Application Auto Scaling coverage.
 *
 * @param resources - Catalog resources filtered to ECS service resource types.
 * @returns Normalized ECS autoscaling models for rule evaluation.
 */
export const hydrateAwsEcsAutoscaling = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsEcsServiceAutoscaling[]> => {
  const servicesByRegion = new Map<string, Array<{ accountId: string } & ParsedEcsAutoscalingService>>();

  for (const resource of resources) {
    const parsed = parseEcsAutoscalingService(resource.arn);

    if (!parsed) {
      continue;
    }

    const regionServices = servicesByRegion.get(resource.region) ?? [];
    regionServices.push({
      accountId: resource.accountId,
      ...parsed,
    });
    servicesByRegion.set(resource.region, regionServices);
  }

  const hydratedPages = await Promise.all(
    [...servicesByRegion.entries()].map(async ([region, regionServices]) => {
      const client = createApplicationAutoScalingClient({ region });
      const scalableTargetIds = new Set<string>();
      const scalingPolicyIds = new Set<string>();
      const regionResourceIds = new Set(regionServices.map((service) => service.resourceId));

      let scalingPoliciesNextToken: string | undefined;

      do {
        const response = await withAwsServiceErrorContext(
          'AWS Application Auto Scaling',
          'DescribeScalingPolicies',
          region,
          () =>
            client.send(
              new DescribeScalingPoliciesCommand({
                ScalableDimension: 'ecs:service:DesiredCount',
                ServiceNamespace: 'ecs',
                NextToken: scalingPoliciesNextToken,
              }),
            ),
        );

        for (const scalingPolicy of response.ScalingPolicies ?? []) {
          if (scalingPolicy.ResourceId && regionResourceIds.has(scalingPolicy.ResourceId)) {
            scalingPolicyIds.add(scalingPolicy.ResourceId);
          }
        }

        scalingPoliciesNextToken = response.NextToken;
      } while (scalingPoliciesNextToken);

      for (const batch of chunkItems(regionServices, APPLICATION_AUTO_SCALING_BATCH_SIZE)) {
        let scalableTargetsNextToken: string | undefined;

        do {
          const response = await withAwsServiceErrorContext(
            'AWS Application Auto Scaling',
            'DescribeScalableTargets',
            region,
            () =>
              client.send(
                new DescribeScalableTargetsCommand({
                  ResourceIds: batch.map((service) => service.resourceId),
                  ScalableDimension: 'ecs:service:DesiredCount',
                  ServiceNamespace: 'ecs',
                  NextToken: scalableTargetsNextToken,
                }),
              ),
          );

          for (const scalableTarget of response.ScalableTargets ?? []) {
            if (scalableTarget.ResourceId) {
              scalableTargetIds.add(scalableTarget.ResourceId);
            }
          }

          scalableTargetsNextToken = response.NextToken;
        } while (scalableTargetsNextToken);
      }

      return regionServices.map((service) => ({
        accountId: service.accountId,
        clusterName: service.clusterName,
        hasScalableTarget: scalableTargetIds.has(service.resourceId),
        hasScalingPolicy: scalingPolicyIds.has(service.resourceId),
        region,
        serviceArn: service.serviceArn,
        serviceName: service.serviceName,
      }));
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.serviceArn.localeCompare(right.serviceArn));
};
