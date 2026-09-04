import type {
  AwsCostOptimizationHubReservationRecommendation,
  CloudProvider,
  Finding,
  FindingMatch,
  LiveResourceBag,
} from '@cloudburn/rules';
import { toBuiltInRuleMetadata } from '../built-in-rules.js';
import { emitDebugLog } from '../debug.js';
import { discoverAwsResources } from '../providers/aws/discovery.js';
import { getAwsRuleEvaluationResourceSet } from '../providers/aws/discovery-registry.js';
import type { AwsDiscoveryProgressEvent, AwsDiscoveryTarget, CloudBurnConfig, ScanResult } from '../types.js';
import { groupFindingsByProvider } from './group-findings.js';
import { buildRuleRegistry } from './registry.js';

const toRuleEvaluationMetadata = (rule: Parameters<typeof toBuiltInRuleMetadata>[0]) => {
  const { id: _id, ...metadata } = toBuiltInRuleMetadata(rule);
  return metadata;
};

type EvaluatedRuleFinding = {
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

const findingIdentityMatches = (left: FindingMatch, right: FindingMatch): boolean =>
  left.resourceId === right.resourceId && left.accountId === right.accountId && left.region === right.region;

const getRecommendationFindingIdentity = (
  recommendation: AwsCostOptimizationHubReservationRecommendation,
): FindingMatch => ({
  accountId: recommendation.accountId,
  region: recommendation.region,
  resourceId: recommendation.resourceId ?? recommendation.resourceArn ?? recommendation.recommendationId,
});

const suppressDuplicateReservationRecommendations = (
  evaluatedRules: EvaluatedRuleFinding[],
  resources: LiveResourceBag,
): EvaluatedRuleFinding[] => {
  const hubRule = evaluatedRules.find((result) => result.ruleId === 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-2');
  if (!hubRule?.finding) {
    return evaluatedRules;
  }

  const hubFindingGroup = hubRule.finding;
  const recommendations = [
    ...new Map(
      resources
        .get('aws-cost-optimization-hub-reservation-recommendations')
        .map((recommendation) => [recommendation.recommendationId, recommendation]),
    ).values(),
  ];
  const retainedFindings = hubFindingGroup.findings.filter((hubFinding, index) => {
    const recommendation = recommendations[index];
    if (!recommendation) {
      return true;
    }
    if (
      recommendation.actionType !== 'PurchaseReservedInstances' ||
      !findingIdentityMatches(hubFinding, getRecommendationFindingIdentity(recommendation))
    ) {
      return true;
    }

    const nativeRuleId = nativeReservationRuleByType[recommendation.reservationType];
    if (!nativeRuleId) {
      return true;
    }

    const nativeFinding = evaluatedRules.find((result) => result.ruleId === nativeRuleId)?.finding;
    return !nativeFinding?.findings.some((finding) => findingIdentityMatches(hubFinding, finding));
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

export const runLiveScan = async (
  config: CloudBurnConfig,
  target: AwsDiscoveryTarget,
  options?: {
    debugLogger?: (message: string) => void;
    includeEvaluationResources?: boolean;
    onProgress?: (event: AwsDiscoveryProgressEvent) => void;
  },
): Promise<ScanResult> => {
  const registry = buildRuleRegistry(config, 'discovery');
  emitDebugLog(options?.debugLogger, `sdk: resolved ${registry.activeRules.length} active discovery rules`);
  const {
    diagnostics = [],
    unavailableDatasets = new Map(),
    ...liveContext
  } = await discoverAwsResources(registry.activeRules, target, {
    debugLogger: options?.debugLogger,
    onProgress: options?.onProgress,
  });
  const unresolvedUnavailableDatasets: unknown = unavailableDatasets;
  const unavailableDatasetDiagnostics =
    unresolvedUnavailableDatasets instanceof Map
      ? unresolvedUnavailableDatasets
      : new Map(
          unresolvedUnavailableDatasets instanceof Set
            ? [...unresolvedUnavailableDatasets].map((datasetKey) => [datasetKey, []] as const)
            : [],
        );
  const scanDiagnostics = [...diagnostics];
  const evaluationRules: NonNullable<ScanResult['evaluations']>['rules'] = [];
  const evaluationResourceSets = new Map<string, NonNullable<ScanResult['evaluations']>['resourceSets'][number]>();
  const evaluatedRules = registry.activeRules.map((rule): EvaluatedRuleFinding => {
    if (!rule.supports.includes('discovery') || !rule.evaluateLive) {
      return {
        provider: rule.provider,
        finding: null,
        ruleId: rule.id,
      };
    }

    const unavailableDependencies = (rule.discoveryDependencies ?? []).filter((dependency) =>
      unavailableDatasetDiagnostics.has(dependency),
    );

    if (unavailableDependencies.length > 0) {
      const skippedRuleDiagnostic = {
        details: unavailableDependencies
          .flatMap((dependency) => unavailableDatasetDiagnostics.get(dependency) ?? [])
          .map((diagnostic) => diagnostic.details)
          .filter((detail): detail is string => detail !== undefined)
          .filter((detail, index, details) => details.indexOf(detail) === index)
          .join('\n'),
        message: `Skipped rule ${rule.id} because required discovery datasets were unavailable: ${unavailableDependencies.join(', ')}.`,
        provider: rule.provider,
        ruleId: rule.id,
        service: rule.service,
        source: 'discovery' as const,
        status: 'skipped' as const,
      };
      scanDiagnostics.push(skippedRuleDiagnostic);
      if (options?.includeEvaluationResources) {
        evaluationRules.push({
          ...toRuleEvaluationMetadata(rule),
          findingCount: 0,
          reason: skippedRuleDiagnostic.message,
          ruleId: rule.id,
          source: 'discovery',
          status: 'not_applicable',
        });
      }

      return {
        provider: rule.provider,
        finding: null,
        ruleId: rule.id,
      };
    }

    const unavailableOptionalDependencies = (rule.optionalDiscoveryDependencies ?? []).filter((dependency) =>
      unavailableDatasetDiagnostics.has(dependency),
    );
    const ruleContext =
      unavailableOptionalDependencies.length === 0
        ? liveContext
        : {
            ...liveContext,
            resources: liveContext.resources.without(unavailableOptionalDependencies),
          };
    const finding = rule.evaluateLive(ruleContext);

    if (options?.includeEvaluationResources) {
      const evaluationResourceSet = getAwsRuleEvaluationResourceSet(rule, liveContext.resources);
      if (!evaluationResourceSets.has(evaluationResourceSet.id)) {
        evaluationResourceSets.set(evaluationResourceSet.id, evaluationResourceSet);
      }
      evaluationRules.push({
        ...toRuleEvaluationMetadata(rule),
        findingCount: finding?.findings.length ?? 0,
        resourceSetId: evaluationResourceSet.id,
        ruleId: rule.id,
        source: 'discovery',
        status: finding ? 'triggered' : 'passed',
      });
    }

    return {
      provider: rule.provider,
      finding,
      ruleId: rule.id,
    };
  });
  const deduplicatedRules = suppressDuplicateReservationRecommendations(evaluatedRules, liveContext.resources);
  const reservationEvaluation = evaluationRules.find(
    (evaluation) => evaluation.ruleId === 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-2',
  );
  if (reservationEvaluation && reservationEvaluation.status !== 'not_applicable') {
    const findingCount =
      deduplicatedRules.find((result) => result.ruleId === 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-2')?.finding?.findings
        .length ?? 0;
    reservationEvaluation.findingCount = findingCount;
    reservationEvaluation.status = findingCount > 0 ? 'triggered' : 'passed';
  }
  const findings = groupFindingsByProvider(deduplicatedRules);

  return {
    ...(scanDiagnostics.length > 0 ? { diagnostics: scanDiagnostics } : {}),
    ...(options?.includeEvaluationResources
      ? { evaluations: { resourceSets: [...evaluationResourceSets.values()], rules: evaluationRules } }
      : {}),
    providers: findings,
  };
};
