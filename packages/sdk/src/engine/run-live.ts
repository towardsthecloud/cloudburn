import { scanAwsResources } from '../providers/aws/scanner.js';
import type { CloudBurnConfig, ScanResult } from '../types.js';
import { buildRuleRegistry } from './registry.js';

export const runLiveScan = async (config: CloudBurnConfig): Promise<ScanResult> => {
  const registry = buildRuleRegistry(config);
  const liveContext = await scanAwsResources(config.live.regions);
  const findings = registry.activeRules.flatMap((rule) => {
    if (!rule.supports.includes('live') || !rule.evaluateLive) {
      return [];
    }

    return rule.evaluateLive(liveContext);
  });

  return {
    mode: 'live',
    findings,
  };
};
