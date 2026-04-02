import { emitDebugLog } from '../debug.js';
import { discoverAwsResources } from '../providers/aws/discovery.js';
import type { AwsDiscoveryTarget, CloudBurnConfig, ScanResult } from '../types.js';
import { groupFindingsByProvider } from './group-findings.js';
import { buildRuleRegistry } from './registry.js';

export const runLiveScan = async (
  config: CloudBurnConfig,
  target: AwsDiscoveryTarget,
  options?: { debugLogger?: (message: string) => void },
): Promise<ScanResult> => {
  const registry = buildRuleRegistry(config, 'discovery');
  emitDebugLog(options?.debugLogger, `sdk: resolved ${registry.activeRules.length} active discovery rules`);
  const {
    diagnostics = [],
    unavailableDatasets = new Map(),
    ...liveContext
  } = options?.debugLogger === undefined
    ? await discoverAwsResources(registry.activeRules, target)
    : await discoverAwsResources(registry.activeRules, target, { debugLogger: options.debugLogger });
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

      return {
        provider: rule.provider,
        finding: rule.evaluateLive(liveContext),
      };
    }),
  );

  return {
    ...(scanDiagnostics.length > 0 ? { diagnostics: scanDiagnostics } : {}),
    providers: findings,
  };
};
