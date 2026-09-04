import type { AwsCostOptimizationHubReservationRecommendation } from '../../shared/metadata.js';

const ARN_NAMESPACE_BY_RESERVATION_TYPE = {
  DynamoDbReservedCapacity: { resourceKind: 'table', resourceType: 'dynamodb:table', service: 'dynamodb' },
  Ec2ReservedInstances: { resourceKind: 'instance', resourceType: 'ec2:instance', service: 'ec2' },
  ElastiCacheReservedInstances: {
    resourceKind: 'cluster',
    resourceType: 'elasticache:cluster',
    service: 'elasticache',
  },
  MemoryDbReservedInstances: { resourceKind: 'cluster', resourceType: 'memorydb:cluster', service: 'memorydb' },
  OpenSearchReservedInstances: { resourceKind: 'domain', resourceType: 'opensearch:domain', service: 'es' },
  RdsReservedInstances: { resourceKind: 'db', resourceType: 'rds:db', service: 'rds' },
  RedshiftReservedInstances: { resourceKind: 'cluster', resourceType: 'redshift:cluster', service: 'redshift' },
} as const;

type ReservationIdentity = Pick<
  AwsCostOptimizationHubReservationRecommendation,
  'recommendationId' | 'reservationType' | 'resourceArn' | 'resourceId'
>;

const getResourceIdFromArn = (recommendation: ReservationIdentity): string | null => {
  if (!recommendation.resourceArn) {
    return null;
  }

  const [prefix, _partition, service, _region, _accountId, ...resourceParts] = recommendation.resourceArn.split(':');
  const expectedNamespace = ARN_NAMESPACE_BY_RESERVATION_TYPE[recommendation.reservationType];
  if (prefix !== 'arn' || service !== expectedNamespace.service) {
    return null;
  }

  const resource = resourceParts.join(':');
  const separatorIndex = [resource.indexOf(':'), resource.indexOf('/')]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  if (separatorIndex === undefined || resource.slice(0, separatorIndex) !== expectedNamespace.resourceKind) {
    return null;
  }

  return resource.slice(separatorIndex + 1) || null;
};

/**
 * Returns the canonical service identifier for a reservation recommendation.
 *
 * @param recommendation - Normalized recommendation identity and reservation type.
 * @returns The supplied resource ID, an ID parsed from a supported ARN, or the stable fallback identity.
 */
export const getAwsCostOptimizationHubReservationResourceId = (recommendation: ReservationIdentity): string =>
  recommendation.resourceId ??
  getResourceIdFromArn(recommendation) ??
  recommendation.resourceArn ??
  recommendation.recommendationId;

/**
 * Returns the provider resource namespace for a reservation recommendation.
 *
 * @param recommendation - Reservation category whose evaluated resource type is required.
 * @returns The service-specific resource namespace shared by findings and evaluation evidence.
 */
export const getAwsCostOptimizationHubReservationResourceType = (
  recommendation: Pick<AwsCostOptimizationHubReservationRecommendation, 'reservationType'>,
): string => ARN_NAMESPACE_BY_RESERVATION_TYPE[recommendation.reservationType].resourceType;
