import type { AwsCostOptimizationHubReservationRecommendation } from '../../shared/metadata.js';
import { canonicalizeAwsResourceId } from '../resource-identity.js';

const ARN_NAMESPACE_BY_RESERVATION_TYPE = {
  DynamoDbReservedCapacity: { resourceType: 'dynamodb:table' },
  Ec2ReservedInstances: { resourceType: 'ec2:instance' },
  ElastiCacheReservedInstances: { resourceType: 'elasticache:cluster' },
  MemoryDbReservedInstances: { resourceType: 'memorydb:cluster' },
  OpenSearchReservedInstances: { resourceType: 'opensearch:domain' },
  RdsReservedInstances: { resourceType: 'rds:db' },
  RedshiftReservedInstances: { resourceType: 'redshift:cluster' },
} as const;

type ReservationIdentity = Pick<
  AwsCostOptimizationHubReservationRecommendation,
  'recommendationId' | 'reservationType' | 'resourceArn' | 'resourceId'
>;

/**
 * Returns the canonical service identifier for a reservation recommendation.
 *
 * @param recommendation - Normalized recommendation identity and reservation type.
 * @returns The supplied resource ID, an ID parsed from a supported ARN, or the stable fallback identity.
 */
export const getAwsCostOptimizationHubReservationResourceId = (recommendation: ReservationIdentity): string =>
  recommendation.resourceId ??
  (recommendation.resourceArn
    ? canonicalizeAwsResourceId(
        ARN_NAMESPACE_BY_RESERVATION_TYPE[recommendation.reservationType].resourceType,
        recommendation.resourceArn,
      )
    : undefined) ??
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
