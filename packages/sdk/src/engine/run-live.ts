import { scanAwsResources } from '../providers/aws/scanner.js';
import type { CloudBurnConfig, ScanResult } from '../types.js';
import { groupFindingsByProvider } from './group-findings.js';
import { buildRuleRegistry } from './registry.js';

export const runLiveScan = async (config: CloudBurnConfig): Promise<ScanResult> => {
  const registry = buildRuleRegistry(config);
  const liveContext = await scanAwsResources(config.live.regions);
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
    providers: findings,
  };
};
