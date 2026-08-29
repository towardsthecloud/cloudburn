import { emitDebugLog } from '../debug.js';
import { discoverAwsResources } from '../providers/aws/discovery.js';
import { getAwsEvaluationResources } from '../providers/aws/discovery-registry.js';
import type { AwsDiscoveryProgressEvent, AwsDiscoveryTarget, CloudBurnConfig, ScanResult } from '../types.js';
import { groupFindingsByProvider } from './group-findings.js';
import { buildRuleRegistry } from './registry.js';

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
        scanDiagnostics.push({
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
          source: 'discovery',
          status: 'skipped',
        });

        return {
          provider: rule.provider,
          finding: null,
        };
      }

      if (options?.includeEvaluationResources) {
        const evaluationDataset = rule.evaluationDataset ?? rule.discoveryDependencies?.[0];
        if (!evaluationDataset) {
          throw new Error(`Discovery rule ${rule.id} does not declare an evaluation dataset.`);
        }
        if (!evaluationResourceSets.has(evaluationDataset)) {
          evaluationResourceSets.set(evaluationDataset, {
            id: evaluationDataset,
            resources: getAwsEvaluationResources(evaluationDataset, liveContext.resources),
          });
        }
        evaluationRules.push({
          provider: rule.provider,
          resourceSetId: evaluationDataset,
          ruleId: rule.id,
          service: rule.service,
          source: 'discovery',
        });
      }

      return {
        provider: rule.provider,
        finding: rule.evaluateLive(liveContext),
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
