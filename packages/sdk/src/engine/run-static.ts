import type { IaCSuppression } from '@cloudburn/rules';
import type { AwsStaticSuppressionTarget } from '../providers/aws/static.js';
import { loadAwsStaticResources } from '../providers/aws/static.js';
import type { CloudBurnConfig, ScanResult, SuppressedFinding } from '../types.js';
import { groupFindingsByProvider } from './group-findings.js';
import { buildRuleRegistry } from './registry.js';

type SuppressionEntry = {
  all?: IaCSuppression;
  byRule: Map<string, IaCSuppression>;
};

const toSuppressionKey = (path: string, resourceId: string): string => `${path}\0${resourceId}`;

const buildSuppressionLookup = (targets: AwsStaticSuppressionTarget[]): Map<string, SuppressionEntry> =>
  new Map(
    targets.map((target) => {
      const byRule = new Map<string, IaCSuppression>();
      let all: IaCSuppression | undefined;

      for (const suppression of target.suppressions) {
        if (suppression.kind === 'rule' && !byRule.has(suppression.ruleId)) {
          byRule.set(suppression.ruleId, suppression);
        } else if (suppression.kind === 'all' && all === undefined) {
          all = suppression;
        }
      }

      return [toSuppressionKey(target.path, target.resourceId), { all, byRule }] as const;
    }),
  );

const findSuppressionEntry = (
  lookup: Map<string, SuppressionEntry>,
  path: string,
  resourceId: string,
): SuppressionEntry | undefined => {
  const exact = lookup.get(toSuppressionKey(path, resourceId));

  if (exact) {
    return exact;
  }

  const qualifierIndex = resourceId.indexOf('#');
  return qualifierIndex === -1 ? undefined : lookup.get(toSuppressionKey(path, resourceId.slice(0, qualifierIndex)));
};

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
  const suppressionLookup = buildSuppressionLookup(suppressionTargets);
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
        const target = match.location
          ? findSuppressionEntry(suppressionLookup, match.location.path, match.resourceId)
          : undefined;
        const suppression = target?.byRule.get(rule.id) ?? target?.all;

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
