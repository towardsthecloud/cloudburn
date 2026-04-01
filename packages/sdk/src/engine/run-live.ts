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
  const { diagnostics = [], ...liveContext } =
    options?.debugLogger === undefined
      ? await discoverAwsResources(registry.activeRules, target)
      : await discoverAwsResources(registry.activeRules, target, { debugLogger: options.debugLogger });
  const findings = groupFindingsByProvider(
    registry.activeRules.map((rule) => {
      if (!rule.supports.includes('discovery') || !rule.evaluateLive) {
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
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    providers: findings,
  };
};
