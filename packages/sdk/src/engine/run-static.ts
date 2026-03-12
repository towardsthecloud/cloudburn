import { loadAwsStaticResources } from '../providers/aws/static.js';
import type { CloudBurnConfig, ScanResult } from '../types.js';
import { groupFindingsByProvider } from './group-findings.js';
import { buildRuleRegistry } from './registry.js';

// Intent: orchestrate static IaC scans by parser -> registry -> rule evaluation.
export const runStaticScan = async (path: string, config: CloudBurnConfig): Promise<ScanResult> => {
  const registry = buildRuleRegistry(config, 'iac');
  const staticContext = await loadAwsStaticResources(path, registry.activeRules);
  const findings = groupFindingsByProvider(
    registry.activeRules.map((rule) => {
      if (!rule.supports.includes('iac') || !rule.evaluateStatic) {
        return {
          provider: rule.provider,
          finding: null,
        };
      }

      return {
        provider: rule.provider,
        finding: rule.evaluateStatic(staticContext),
      };
    }),
  );

  return {
    providers: findings,
  };
};
