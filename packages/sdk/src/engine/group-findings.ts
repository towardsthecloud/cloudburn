import type { CloudProvider, Finding } from '@cloudburn/rules';
import type { ProviderFindingGroup } from '../types.js';

type ProviderScopedFinding = {
  provider: CloudProvider;
  finding: Finding | null;
};

/** Groups non-empty rule findings by provider for the public scan result shape. */
export const groupFindingsByProvider = (findings: ProviderScopedFinding[]): ProviderFindingGroup[] => {
  const groupedFindings = new Map<CloudProvider, Finding[]>();

  for (const { provider, finding } of findings) {
    if (!finding || finding.findings.length === 0) {
      continue;
    }

    const providerFindings = groupedFindings.get(provider) ?? [];

    providerFindings.push(finding);
    groupedFindings.set(provider, providerFindings);
  }

  return Array.from(groupedFindings, ([groupProvider, rules]) => ({
    provider: groupProvider,
    rules,
  }));
};
