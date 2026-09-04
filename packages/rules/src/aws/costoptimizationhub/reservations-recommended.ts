import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';
import { getAwsCostOptimizationHubReservationResourceId } from './reservation-identity.js';

const RULE_ID = 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-2';
const RULE_SERVICE = 'costoptimizationhub';
const RULE_SEVERITY = 'medium' as const;
const RULE_MESSAGE = 'Reservation-eligible usage should use reserved capacity when AWS recommends a purchase.';
const RESOURCE_TYPE_BY_RESERVATION_TYPE = {
  DynamoDbReservedCapacity: 'dynamodb:table',
  Ec2ReservedInstances: 'ec2:instance',
  ElastiCacheReservedInstances: 'elasticache:cluster',
  MemoryDbReservedInstances: 'memorydb:cluster',
  OpenSearchReservedInstances: 'opensearch:domain',
  RdsReservedInstances: 'rds:db',
  RedshiftReservedInstances: 'redshift:cluster',
} as const;

/** Flag reservation purchases recommended by AWS Cost Optimization Hub. */
export const costOptimizationHubReservationsRecommendedRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'Reservation-Eligible Usage Without Reserved Capacity',
  description:
    'Flag EC2, RDS, OpenSearch, Redshift, ElastiCache, MemoryDB, and DynamoDB reservation purchases recommended by AWS.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-cost-optimization-hub-reservation-recommendations'],
  evaluateLive: ({ resources }) => {
    const recommendations = new Map(
      resources
        .get('aws-cost-optimization-hub-reservation-recommendations')
        .map((recommendation) => [recommendation.recommendationId, recommendation]),
    );
    const findings = [...recommendations.values()].map((recommendation) => ({
      ...createFindingMatch(
        getAwsCostOptimizationHubReservationResourceId(recommendation),
        recommendation.region ?? recommendation.configuration.reservedInstancesRegion,
        recommendation.accountId,
      ),
      resourceType: RESOURCE_TYPE_BY_RESERVATION_TYPE[recommendation.reservationType],
    }));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
