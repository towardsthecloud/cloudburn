import { createFindingMatch } from '../../shared/helpers.js';
import { createFinancialEvidence } from '../../shared/impact.js';
import type {
  AwsCostOptimizationHubGravitonRecommendation,
  AwsCostOptimizationHubIdleRecommendation,
  AwsCostOptimizationHubReservationRecommendation,
  AwsCostOptimizationHubRightsizingRecommendation,
  AwsCostOptimizationHubSavingsPlansRecommendation,
  AwsCostOptimizationHubUpgradeRecommendation,
  EvidenceProvenance,
  FindingImpact,
  FindingMatch,
} from '../../shared/metadata.js';
import { createRecommendationMatch } from '../../shared/recommendation.js';
import { canonicalizeAwsResourceId, getAwsArnScope } from '../resource-identity.js';
import { gravitonResourceTypes } from './graviton-identity.js';
import { getAwsCostOptimizationHubIdleResourceId, getAwsCostOptimizationHubIdleResourceType } from './idle-identity.js';
import {
  getAwsCostOptimizationHubReservationResourceId,
  getAwsCostOptimizationHubReservationResourceType,
} from './reservation-identity.js';
import { getAwsCostOptimizationHubRightsizingResourceType } from './rightsizing-identity.js';
import {
  getAwsCostOptimizationHubUpgradeResourceId,
  getAwsCostOptimizationHubUpgradeResourceType,
} from './upgrade-identity.js';

type HubRecommendation =
  | AwsCostOptimizationHubSavingsPlansRecommendation
  | AwsCostOptimizationHubReservationRecommendation
  | AwsCostOptimizationHubIdleRecommendation
  | AwsCostOptimizationHubRightsizingRecommendation
  | AwsCostOptimizationHubUpgradeRecommendation
  | AwsCostOptimizationHubGravitonRecommendation;

const comparableResourceId = (resourceType: string, resourceId: string): string => {
  const canonical = canonicalizeAwsResourceId(resourceType, resourceId);
  return resourceType === 'lambda:function' &&
    /^arn:[^:]+:lambda:[^:]+:[^:]+:function:[^:]+(?::[^:]+)?$/.test(canonical)
    ? canonical.split(':').slice(0, 7).join(':')
    : canonical;
};

/**
 * Maps a normalized AWS Cost Optimization Hub recommendation to a finding match.
 *
 * The match keeps the source recommendation ID only as `sourceId` provenance; the
 * computed identity comes from the canonical resource scope and action instead.
 * Purchase recommendations without a real resource identity keep their display
 * resource ID and carry provenance without `resourceKey`/`opportunityId`.
 *
 * @param item - Normalized Hub recommendation of any supported action category.
 * @returns A finding match with recommendation provenance and identity when scoped.
 */
export const createAwsCostOptimizationHubFindingMatch = (
  item: HubRecommendation,
): FindingMatch & { resourceType: string } => {
  const provenance: EvidenceProvenance = {
    source: 'aws-cost-optimization-hub',
    ...(item.recommendationSource ? { sourceDetail: item.recommendationSource } : {}),
    ...(item.recommendationId ? { sourceId: item.recommendationId } : {}),
    ...(item.lastRefreshTimestamp ? { refreshedAt: item.lastRefreshTimestamp } : {}),
  };
  const impact: FindingImpact = {
    ...provenance,
    currentCost: createFinancialEvidence({
      amount: item.estimatedMonthlyCost,
      currency: item.currencyCode,
      period: 'month',
      confidence: 'estimated',
    }),
    potentialSavings: createFinancialEvidence({
      amount: item.estimatedMonthlySavings,
      currency: item.currencyCode,
      period: 'month',
      confidence: 'estimated',
    }),
    ...(typeof item.recommendationLookbackPeriodInDays === 'number' &&
    Number.isFinite(item.recommendationLookbackPeriodInDays) &&
    item.recommendationLookbackPeriodInDays > 0
      ? { window: { lookbackDays: item.recommendationLookbackPeriodInDays } }
      : {}),
  };
  const attach = (input: FindingMatch & { resourceType: string }): FindingMatch & { resourceType: string } => {
    const match = {
      ...input,
      impact,
      ...(input.resourceType === 'ecs:service' && item.resourceArn
        ? { resourceId: canonicalizeAwsResourceId('ecs:service', item.resourceArn) }
        : {}),
    };
    const hasConflictingArn = [item.resourceId, item.resourceArn].some((id) => {
      if (!id) return false;
      const scope = getAwsArnScope(id);
      return (
        scope !== undefined &&
        ((scope.accountId !== '' && scope.accountId !== match.accountId) ||
          (scope.region !== '' && scope.region !== match.region))
      );
    });
    const canonicalId = item.resourceId ? comparableResourceId(match.resourceType, item.resourceId) : undefined;
    const canonicalArn = item.resourceArn ? comparableResourceId(match.resourceType, item.resourceArn) : undefined;
    const hasConflictingResource =
      canonicalId !== undefined &&
      canonicalArn !== undefined &&
      (match.resourceType === 'ecs:service' && !canonicalId.includes('/') && !canonicalId.startsWith('arn:')
        ? canonicalArn.split('/').at(-1) !== canonicalId
        : canonicalId !== canonicalArn);
    return (item.resourceId || item.resourceArn) && !hasConflictingArn && !hasConflictingResource
      ? { ...createRecommendationMatch('aws', match, provenance), resourceType: match.resourceType }
      : { ...match, recommendation: provenance };
  };

  switch (item.actionType) {
    case 'PurchaseSavingsPlans':
      return attach({
        ...createFindingMatch(
          item.resourceId ?? item.resourceArn ?? item.recommendationId,
          item.region,
          item.accountId,
        ),
        resourceType: 'costoptimizationhub:savings-plans-recommendation',
        actionType: item.actionType,
      });
    case 'PurchaseReservedInstances':
      return attach({
        ...createFindingMatch(
          getAwsCostOptimizationHubReservationResourceId(item),
          item.region ?? item.configuration.reservedInstancesRegion,
          item.accountId,
        ),
        resourceType: getAwsCostOptimizationHubReservationResourceType(item),
        actionType: item.actionType,
      });
    case 'Stop':
    case 'Delete':
    case 'ScaleIn':
      return attach({
        ...createFindingMatch(getAwsCostOptimizationHubIdleResourceId(item), item.region, item.accountId),
        resourceType: getAwsCostOptimizationHubIdleResourceType(item),
        actionType: item.actionType,
      });
    case 'Rightsize':
      return attach({
        ...createFindingMatch(item.resourceId, item.region, item.accountId),
        resourceType: getAwsCostOptimizationHubRightsizingResourceType(item),
        actionType: item.actionType,
      });
    case 'Upgrade':
      return attach({
        ...createFindingMatch(getAwsCostOptimizationHubUpgradeResourceId(item), item.region, item.accountId),
        resourceType: getAwsCostOptimizationHubUpgradeResourceType(item),
        actionType: item.actionType,
      });
    case 'MigrateToGraviton': {
      const resourceType = gravitonResourceTypes[item.currentResourceType];
      return attach({
        ...createFindingMatch(
          canonicalizeAwsResourceId(resourceType, item.resourceId ?? item.resourceArn ?? item.recommendationId),
          item.region,
          item.accountId,
        ),
        resourceType,
        actionType: item.actionType,
      });
    }
  }
};
