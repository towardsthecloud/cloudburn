import { discoverAwsResources } from '../providers/aws/discovery.js';
import type { AwsDiscoveryTarget, CloudBurnConfig, ScanResult } from '../types.js';
import { groupFindingsByProvider } from './group-findings.js';
import { buildRuleRegistry } from './registry.js';

export const runLiveScan = async (config: CloudBurnConfig, target: AwsDiscoveryTarget): Promise<ScanResult> => {
  const registry = buildRuleRegistry(config, 'discovery');
  const { diagnostics = [], ...liveContext } = await discoverAwsResources(registry.activeRules, target);
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
