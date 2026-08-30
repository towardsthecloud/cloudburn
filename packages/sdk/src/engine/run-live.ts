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
  const findings = groupFindingsByProvider(
    registry.activeRules.map((rule) => {
      if (!rule.supports.includes('discovery') || !rule.evaluateLive) {
        return {
          provider: rule.provider,
          finding: null,
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
        };
      }

      const finding = rule.evaluateLive(liveContext);

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
      };
    }),
  );

  return {
    ...(scanDiagnostics.length > 0 ? { diagnostics: scanDiagnostics } : {}),
    ...(options?.includeEvaluationResources
      ? { evaluations: { resourceSets: [...evaluationResourceSets.values()], rules: evaluationRules } }
      : {}),
    providers: findings,
  };
};
