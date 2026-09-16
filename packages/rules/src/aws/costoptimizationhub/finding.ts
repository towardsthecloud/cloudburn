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

const hasMatchingEcsServiceName = (left: string, right: string): boolean => {
  const localIdentity = /^[^/:]+(?:\/[^/:]+)?$/;
  return (
    localIdentity.test(left) &&
    localIdentity.test(right) &&
    (!left.includes('/') || !right.includes('/')) &&
    left.split('/').at(-1) === right.split('/').at(-1)
  );
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
    ...(typeof item.costCalculationLookbackPeriodInDays === 'number' &&
    Number.isFinite(item.costCalculationLookbackPeriodInDays) &&
    item.costCalculationLookbackPeriodInDays > 0
      ? { window: { lookbackDays: item.costCalculationLookbackPeriodInDays } }
      : {}),
  };
  const attach = (input: FindingMatch & { resourceType: string }): FindingMatch & { resourceType: string } => {
    const hasConflictingArn = [item.resourceId, item.resourceArn].some((id) => {
      if (!id?.startsWith('arn:')) return false;
      const scope = getAwsArnScope(id);
      return (
        scope === undefined ||
        (scope.accountId !== '' && scope.accountId !== input.accountId) ||
        (scope.region !== '' && scope.region !== input.region)
      );
    });
    const canonicalId = item.resourceId ? canonicalizeAwsResourceId(input.resourceType, item.resourceId) : undefined;
    const canonicalArn = item.resourceArn ? canonicalizeAwsResourceId(input.resourceType, item.resourceArn) : undefined;
    const lambdaArn =
      input.resourceType === 'lambda:function'
        ? [canonicalId, canonicalArn].find(
            (id) => id !== undefined && /^arn:[^:]+:lambda:[^:]+:[^:]+:function:[^:]+$/.test(id),
          )
        : undefined;
    const lambdaName = canonicalId?.startsWith('arn:') ? canonicalArn : canonicalId;
    const matchingLambdaName =
      lambdaArn !== undefined &&
      lambdaName !== undefined &&
      /^[^:/]+(?::[^:/]+)?$/.test(lambdaName) &&
      lambdaName.split(':')[0] === lambdaArn.split(':')[6];
    const hasConflictingResource =
      canonicalId !== undefined &&
      canonicalArn !== undefined &&
      canonicalId !== canonicalArn &&
      !matchingLambdaName &&
      !(input.resourceType === 'ecs:service' && hasMatchingEcsServiceName(canonicalId, canonicalArn));
    const hasConflictingReservationRegion =
      item.actionType === 'PurchaseReservedInstances' &&
      item.region !== undefined &&
      item.configuration.reservedInstancesRegion !== undefined &&
      item.region !== item.configuration.reservedInstancesRegion;
    if (
      !(item.resourceId || item.resourceArn) ||
      hasConflictingArn ||
      hasConflictingResource ||
      hasConflictingReservationRegion
    ) {
      return { ...input, impact, recommendation: provenance };
    }
    const resourceId =
      lambdaArn ??
      (input.resourceType === 'ecs:service' &&
      canonicalArn &&
      /^[^/:]+\/[^/:]+$/.test(canonicalArn) &&
      !(canonicalId && /^[^/:]+\/[^/:]+$/.test(canonicalId))
        ? canonicalArn
        : input.resourceId);
    return {
      ...createRecommendationMatch('aws', { ...input, impact, resourceId }, provenance),
      resourceType: input.resourceType,
    };
  };

  switch (item.actionType) {
    case 'PurchaseSavingsPlans':
      return attach({
        ...createFindingMatch(
          item.resourceId ?? item.resourceArn ?? item.recommendationId,
          item.region,
          item.accountId,
        ),
        resourceType: `costoptimizationhub:savings-plans-recommendation:${item.savingsPlansType}`,
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
