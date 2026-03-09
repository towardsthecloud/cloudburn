import type { StaticEvaluationContext } from '@cloudburn/rules';
import { parseTerraform } from '../parsers/index.js';
import type { IaCResource } from '../parsers/types.js';
import type { CloudBurnConfig, ScanResult } from '../types.js';
import { groupFindingsByProvider } from './group-findings.js';
import { buildRuleRegistry } from './registry.js';

// Intent: orchestrate static IaC scans by parser -> registry -> rule evaluation.
// TODO(cloudburn): evaluate static rule handlers and return real findings.
const toStaticContext = (resources: IaCResource[]): StaticEvaluationContext => ({
  terraformResources: resources,
});

export const runStaticScan = async (path: string, config: CloudBurnConfig): Promise<ScanResult> => {
  const registry = buildRuleRegistry(config);
  const terraformResources = await parseTerraform(path);
  const staticContext = toStaticContext(terraformResources);
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
