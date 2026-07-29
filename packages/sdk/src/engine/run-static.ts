import { loadAwsStaticResources } from '../providers/aws/static.js';
import type { CloudBurnConfig, ScanResult, SuppressedFinding } from '../types.js';
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
  const { diagnostics, suppressionTargets, ...staticContext } = await loadAwsStaticResources(
    path,
    registry.activeRules,
  );
  const suppressed: SuppressedFinding[] = [];
  const findings = groupFindingsByProvider(
    registry.activeRules.map((rule) => {
      if (!rule.supports.includes('iac') || !rule.evaluateStatic) {
        return {
          provider: rule.provider,
          finding: null,
        };
      }

      const finding = rule.evaluateStatic(staticContext);

      if (!finding) {
        return {
          provider: rule.provider,
          finding: null,
        };
      }

      const activeFindings = finding.findings.filter((match) => {
        const target = suppressionTargets.find(
          (candidate) =>
            match.location?.path === candidate.path &&
            (match.resourceId === candidate.resourceId || match.resourceId.startsWith(`${candidate.resourceId}#`)),
        );
        const suppression =
          target?.suppressions.find((candidate) => candidate.kind === 'rule' && candidate.ruleId === rule.id) ??
          target?.suppressions.find((candidate) => candidate.kind === 'all');

        if (!suppression) {
          return true;
        }

        suppressed.push({
          finding: match,
          message: finding.message,
          provider: rule.provider,
          ruleId: finding.ruleId,
          service: finding.service,
          severity: finding.severity,
          source: 'iac',
          suppression,
        });
        return false;
      });

      return {
        provider: rule.provider,
        finding: activeFindings.length > 0 ? { ...finding, findings: activeFindings } : null,
      };
    }),
  );

  return {
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    providers: findings,
    ...(suppressed.length > 0 ? { suppressed } : {}),
  };
};
