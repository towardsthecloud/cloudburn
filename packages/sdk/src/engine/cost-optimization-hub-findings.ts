import {
  type AwsCostOptimizationHubReservationRecommendation,
  type CloudProvider,
  createFindingMatch,
  type Finding,
  type FindingMatch,
  type LiveResourceBag,
} from '@cloudburn/rules';

/** Finding output retained for one active rule before provider grouping. */
export type EvaluatedRuleFinding = {
  finding: Finding | null;
  provider: CloudProvider;
  ruleId: string;
};

const nativeReservationRuleByType: Partial<
  Record<AwsCostOptimizationHubReservationRecommendation['reservationType'], string>
> = {
  ElastiCacheReservedInstances: 'CLDBRN-AWS-ELASTICACHE-1',
  RdsReservedInstances: 'CLDBRN-AWS-RDS-3',
  RedshiftReservedInstances: 'CLDBRN-AWS-REDSHIFT-2',
};
const nativeReservationRuleIds = new Set(Object.values(nativeReservationRuleByType));

const findingIdentityKey = (finding: FindingMatch): string =>
  JSON.stringify([finding.resourceId, finding.accountId ?? null, finding.region ?? null]);

const getRecommendationFindingIdentity = (
  recommendation: AwsCostOptimizationHubReservationRecommendation,
): FindingMatch =>
  createFindingMatch(
    recommendation.resourceId ?? recommendation.resourceArn ?? recommendation.recommendationId,
    recommendation.region,
    recommendation.accountId,
  );

/**
 * Removes Hub reservation findings already backed by a stronger enabled native finding.
 *
 * @param evaluatedRules - Finding output from every active discovery rule.
 * @param resources - Loaded live datasets used to match Hub recommendations to native findings.
 * @returns Evaluated rules with exact reservation duplicates removed from the Hub rule.
 */
export const consolidateCostOptimizationHubFindings = (
  evaluatedRules: EvaluatedRuleFinding[],
  resources: LiveResourceBag,
): EvaluatedRuleFinding[] => {
  const hubRule = evaluatedRules.find((result) => result.ruleId === 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-2');
  if (!hubRule?.finding) {
    return evaluatedRules;
  }
  const hubFindingGroup = hubRule.finding;

  const nativeFindingKeysByRuleId = new Map<string, Set<string>>();
  for (const result of evaluatedRules) {
    if (result.finding && nativeReservationRuleIds.has(result.ruleId)) {
      nativeFindingKeysByRuleId.set(
        result.ruleId,
        new Set(result.finding.findings.map((finding) => findingIdentityKey(finding))),
      );
    }
  }
  if (nativeFindingKeysByRuleId.size === 0) {
    return evaluatedRules;
  }

  const recommendations = [
    ...new Map(
      resources
        .get('aws-cost-optimization-hub-reservation-recommendations')
        .map((recommendation) => [recommendation.recommendationId, recommendation]),
    ).values(),
  ];
  const retainedFindings = hubFindingGroup.findings.filter((hubFinding, index) => {
    const recommendation = recommendations[index];
    if (recommendation?.actionType !== 'PurchaseReservedInstances') {
      return true;
    }

    const hubFindingKey = findingIdentityKey(hubFinding);
    if (hubFindingKey !== findingIdentityKey(getRecommendationFindingIdentity(recommendation))) {
      return true;
    }

    const nativeRuleId = nativeReservationRuleByType[recommendation.reservationType];
    return !nativeRuleId || !nativeFindingKeysByRuleId.get(nativeRuleId)?.has(hubFindingKey);
  });

  return evaluatedRules.map((result) =>
    result !== hubRule
      ? result
      : {
          ...result,
          finding:
            retainedFindings.length > 0
              ? {
                  ...hubFindingGroup,
                  findings: retainedFindings,
                }
              : null,
        },
  );
};
