import { type DiscoveryDatasetMap, LiveResourceBag, type Rule } from '@cloudburn/rules';
import { toBuiltInRuleMetadata } from '../built-in-rules.js';
import { emitDebugLog } from '../debug.js';
import { discoverAwsResources } from '../providers/aws/discovery.js';
import { getAwsRuleEvaluationResourceSet } from '../providers/aws/discovery-registry.js';
import { getAwsEvidenceProvenance } from '../providers/aws/evidence.js';
import type { AwsDiscoveryProgressEvent, AwsDiscoveryTarget, CloudBurnConfig, ScanResult } from '../types.js';
import { applyFindingPrecedence, type EvaluatedRuleFinding } from './finding-precedence.js';
import { groupFindingsByProvider } from './group-findings.js';
import { buildRuleRegistry } from './registry.js';

const toRuleEvaluationMetadata = (rule: Parameters<typeof toBuiltInRuleMetadata>[0]) => {
  const { id: _id, ...metadata } = toBuiltInRuleMetadata(rule);
  return metadata;
};

/**
 * Collects selected live evidence and evaluates rules, optionally reporting provisional results.
 * @param config - Effective rule selection and discovery configuration.
 * @param target - AWS catalog and account collection scope.
 * @param options - Debug logging, optional evaluation projection, and provisional progress callback.
 * @returns Authoritative results after all evidence and finding precedence are resolved.
 */
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
  const startedAtMs = Date.now();
  let completedRules = 0;
  let firstRuleMs: number | undefined;
  const context = await discoverAwsResources(registry.activeRules, target, {
    debugLogger: options?.debugLogger,
    onProgress: options?.onProgress,
    ...(options?.onProgress
      ? {
          onRuleReady: (rule: Rule, context: Awaited<ReturnType<typeof discoverAwsResources>>) => {
            const result = evaluateLiveRules([rule], context, { includeEvaluationStatus: true });
            const evaluation = result.evaluations?.rules[0];
            if (!evaluation) return;
            completedRules += 1;
            const elapsedMs = Date.now() - startedAtMs;
            firstRuleMs ??= elapsedMs;
            options.onProgress?.({
              kind: 'rule',
              ruleId: rule.id,
              provisional: true,
              status: evaluation.status,
              findingCount: evaluation.findingCount,
              findings: result.providers.flatMap((provider) => provider.rules.flatMap((finding) => finding.findings)),
              ...(evaluation.reason ? { reason: evaluation.reason } : {}),
              completedRules,
              totalRules: registry.activeRules.length,
              elapsedMs,
            });
          },
        }
      : {}),
  });
  const result = evaluateLiveRules(registry.activeRules, context, options);
  emitDebugLog(
    options?.debugLogger,
    `sdk: live scan timing ${JSON.stringify({ firstRuleMs: firstRuleMs ?? null, totalMs: Date.now() - startedAtMs })}`,
  );
  return {
    ...result,
    ...(getAwsEvidenceProvenance() ? { evidence: getAwsEvidenceProvenance() } : {}),
  };
};

// The same evaluation path handles provisional snapshots and the authoritative final context.
// Re-evaluate at completion so a later catalog failure or precedence winner cannot leave stale output.
const evaluateLiveRules = (
  rules: Rule[],
  context: Awaited<ReturnType<typeof discoverAwsResources>>,
  options?: { includeEvaluationResources?: boolean; includeEvaluationStatus?: boolean },
): ScanResult => {
  const includeEvaluationResources = options?.includeEvaluationResources;
  const includeEvaluations = includeEvaluationResources || options?.includeEvaluationStatus;
  const { diagnostics = [], unavailableDatasets = new Map(), unavailableRegions = new Map(), ...liveContext } = context;
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
  const evaluatedRules = rules.map((rule): EvaluatedRuleFinding => {
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
      if (includeEvaluations) {
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
    const coverage = rule.getLiveEvaluationCoverage?.(ruleContext);
    const unknownCount = coverage?.unknown.length ?? 0;
    const coverageReason =
      unknownCount > 0
        ? `Could not assess ${unknownCount} resource(s) for rule ${rule.id} because required evidence was incomplete or unavailable.`
        : excludedRegions.size > 0
          ? `Could not assess resources in ${[...excludedRegions].sort().join(', ')} because required discovery evidence was unavailable.`
          : undefined;
    if (unknownCount > 0 && coverageReason) {
      scanDiagnostics.push({
        message: coverageReason,
        provider: rule.provider,
        ruleId: rule.id,
        service: rule.service,
        source: 'discovery',
        status: 'skipped',
      });
    }

    if (includeEvaluations) {
      const evaluationResourceSet = includeEvaluationResources
        ? getAwsRuleEvaluationResourceSet(rule, ruleContext.resources)
        : undefined;
      if (evaluationResourceSet) {
        if (excludedRegions.size > 0) evaluationResourceSet.id += `:excluding:${[...excludedRegions].sort().join(',')}`;
        if (!evaluationResourceSets.has(evaluationResourceSet.id)) {
          evaluationResourceSets.set(evaluationResourceSet.id, evaluationResourceSet);
        }
      }
      evaluationRules.push({
        ...toRuleEvaluationMetadata(rule),
        ...(coverage ? { coverage } : {}),
        ...(coverageReason ? { reason: coverageReason } : {}),
        findingCount: finding?.findings.length ?? 0,
        ...(evaluationResourceSet ? { resourceSetId: evaluationResourceSet.id } : {}),
        ruleId: rule.id,
        source: 'discovery',
        status: finding ? 'triggered' : coverageReason ? 'unknown' : 'passed',
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
    ...(includeEvaluations
      ? { evaluations: { resourceSets: [...evaluationResourceSets.values()], rules: evaluationRules } }
      : {}),
    providers: findings,
  };
};
