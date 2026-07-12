import { loadAwsStaticResources } from '../providers/aws/static.js';
import type { CloudBurnConfig, ScanResult } from '../types.js';
import { groupFindingsByProvider } from './group-findings.js';
import { buildRuleRegistry } from './registry.js';

/**
 * Runs a static IaC scan and returns provider-grouped findings plus non-fatal diagnostics.
 *
 * @param path - IaC file or directory to scan.
 * @param config - Effective CloudBurn configuration.
 * @returns Static scan findings and any skipped-file diagnostics.
 */
export const runStaticScan = async (path: string, config: CloudBurnConfig): Promise<ScanResult> => {
  const registry = buildRuleRegistry(config, 'iac');
  const { diagnostics, ...staticContext } = await loadAwsStaticResources(path, registry.activeRules);
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
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    providers: findings,
  };
};
