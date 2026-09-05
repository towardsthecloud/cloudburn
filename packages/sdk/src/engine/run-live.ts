import { type DiscoveryDatasetMap, LiveResourceBag } from '@cloudburn/rules';
import { toBuiltInRuleMetadata } from '../built-in-rules.js';
import { emitDebugLog } from '../debug.js';
import { discoverAwsResources } from '../providers/aws/discovery.js';
import { getAwsRuleEvaluationResourceSet } from '../providers/aws/discovery-registry.js';
import type { AwsDiscoveryProgressEvent, AwsDiscoveryTarget, CloudBurnConfig, ScanResult } from '../types.js';
import { applyFindingPrecedence, type EvaluatedRuleFinding } from './finding-precedence.js';
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
    unavailableRegions = new Map(),
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
        supersedesRuleIds: rule.supersedesRuleIds,
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
        supersedesRuleIds: rule.supersedesRuleIds,
      };
    }

    const unavailableOptionalDependencies = (rule.optionalDiscoveryDependencies ?? []).filter((dependency) =>
      unavailableDatasetDiagnostics.has(dependency),
    );
    const excludedRegions = new Set<string>(
      (rule.discoveryDependencies ?? []).flatMap((key) => [...(unavailableRegions.get(key) ?? [])]),
    );
    const dependencies = [...(rule.discoveryDependencies ?? []), ...(rule.optionalDiscoveryDependencies ?? [])];
    const ruleContext =
      excludedRegions.size === 0 &&
      unavailableOptionalDependencies.length === 0 &&
      !dependencies.some((key) => unavailableRegions.has(key))
        ? liveContext
        : {
            ...liveContext,
            catalog: {
              ...liveContext.catalog,
              resources: liveContext.catalog.resources.filter((resource) => !excludedRegions.has(resource.region)),
            },
            resources: new LiveResourceBag(
              Object.fromEntries(
                dependencies
                  .filter((key) => !unavailableOptionalDependencies.includes(key))
                  .map((key) => [
                    key,
                    liveContext.resources
                      .get(key)
                      .filter(
                        (resource) =>
                          !(
                            'region' in resource &&
                            typeof resource.region === 'string' &&
                            (excludedRegions.has(resource.region) || unavailableRegions.get(key)?.has(resource.region))
                          ),
                      ),
                  ]),
              ) as Partial<DiscoveryDatasetMap>,
            ),
          };
    for (const region of excludedRegions) {
      scanDiagnostics.push({
        message: `Skipped rule ${rule.id} in ${region} because required discovery evidence was unavailable.`,
        provider: rule.provider,
        ruleId: rule.id,
        region,
        service: rule.service,
        source: 'discovery',
        status: 'skipped',
      });
    }
    const finding = rule.evaluateLive(ruleContext);

    if (options?.includeEvaluationResources) {
      const evaluationResourceSet = getAwsRuleEvaluationResourceSet(rule, ruleContext.resources);
      if (excludedRegions.size > 0) evaluationResourceSet.id += `:excluding:${[...excludedRegions].sort().join(',')}`;
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
      supersedesRuleIds: rule.supersedesRuleIds,
    };
  });
  const consolidatedRules = applyFindingPrecedence(evaluatedRules);
  const findings = groupFindingsByProvider(consolidatedRules);

  return {
    ...(scanDiagnostics.length > 0 ? { diagnostics: scanDiagnostics } : {}),
    ...(options?.includeEvaluationResources
      ? { evaluations: { resourceSets: [...evaluationResourceSets.values()], rules: evaluationRules } }
      : {}),
    providers: findings,
  };
};
