import type { CloudProvider, Finding, FindingMatch } from '@cloudburn/rules';

/** Finding output retained with the precedence declared by one active rule. */
export type EvaluatedRuleFinding = {
  finding: Finding | null;
  provider: CloudProvider;
  ruleId: string;
  supersedesRuleIds?: string[];
};

const findingIdentityKey = (finding: FindingMatch): string =>
  JSON.stringify([finding.resourceId, finding.accountId ?? null, finding.region ?? null]);

/**
 * Removes exact resource findings replaced by stronger findings from active rules.
 *
 * @param evaluatedRules - Finding output and precedence metadata from every active rule.
 * @returns Evaluated rules with only identical, explicitly superseded findings removed.
 */
export const applyFindingPrecedence = (evaluatedRules: EvaluatedRuleFinding[]): EvaluatedRuleFinding[] => {
  const supersedingFindingKeysByRuleId = new Map<string, Set<string>>();

  for (const result of evaluatedRules) {
    if (!result.finding) {
      continue;
    }

    for (const supersededRuleId of result.supersedesRuleIds ?? []) {
      const findingKeys = supersedingFindingKeysByRuleId.get(supersededRuleId) ?? new Set<string>();
      for (const finding of result.finding.findings) {
        findingKeys.add(findingIdentityKey(finding));
      }
      supersedingFindingKeysByRuleId.set(supersededRuleId, findingKeys);
    }
  }

  return evaluatedRules.map((result) => {
    const supersedingFindingKeys = supersedingFindingKeysByRuleId.get(result.ruleId);
    if (!result.finding || !supersedingFindingKeys) {
      return result;
    }

    const retainedFindings = result.finding.findings.filter(
      (finding) => !supersedingFindingKeys.has(findingIdentityKey(finding)),
    );

    return {
      ...result,
      finding:
        retainedFindings.length > 0
          ? {
              ...result.finding,
              findings: retainedFindings,
            }
          : null,
    };
  });
};
