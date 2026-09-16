import type { CloudProvider, Finding, FindingMatch } from '@cloudburn/rules';
import { compareRecommendationMatches, getRecommendationIdentity } from '@cloudburn/rules';

/** Finding output retained with the precedence declared by one active rule. */
export type EvaluatedRuleFinding = {
  finding: Finding | null;
  provider: CloudProvider;
  ruleId: string;
  supersedesRuleIds?: string[];
};

type Candidate = {
  match: FindingMatch;
  ruleId: string;
  provider: CloudProvider;
  supersedesRuleIds: string[];
};

/**
 * Removes findings replaced by stronger findings from active rules.
 *
 * Matches group by their computed opportunity identity — provider, account, Region,
 * resource namespace, canonical resource ID, and action — never by a supplied key.
 * A match carrying normalized recommendation provenance without `opportunityId`
 * deliberately has no identity and skips precedence entirely. Within one
 * opportunity each rule keeps its freshest match occurrence, then declared
 * precedence resolves the rest: rules are ordered by descending transitive
 * supersession reach and then lexically, so cycles and chains never remove every
 * candidate. Matches without a complete scope, and rules outside the declared
 * graph, are always preserved.
 *
 * @param evaluatedRules - Finding output and precedence metadata from every active rule.
 * @returns Evaluated rules in deterministic order with superseded findings removed.
 */
export const applyFindingPrecedence = (evaluatedRules: EvaluatedRuleFinding[]): EvaluatedRuleFinding[] => {
  const candidatesByResult = evaluatedRules.map((result) =>
    (result.finding?.findings ?? []).map((match) => ({
      match,
      ruleId: result.ruleId,
      provider: result.provider,
      supersedesRuleIds: result.supersedesRuleIds ?? [],
    })),
  );

  const groups = new Map<string, Candidate[]>();
  for (const [resultIndex, result] of evaluatedRules.entries()) {
    for (const candidate of candidatesByResult[resultIndex] ?? []) {
      const identity =
        candidate.match.recommendation && !candidate.match.recommendation.opportunityId
          ? undefined
          : getRecommendationIdentity(result.provider, candidate.match);
      if (!identity) {
        continue;
      }
      const group = groups.get(identity.opportunityId) ?? [];
      group.push(candidate);
      groups.set(identity.opportunityId, group);
    }
  }

  const dropped = new Set<Candidate>();

  for (const group of groups.values()) {
    const candidatesByRule = new Map<string, Candidate[]>();
    const supersedesByRuleId = new Map<string, Set<string>>();
    for (const candidate of group) {
      const candidates = candidatesByRule.get(candidate.ruleId) ?? [];
      candidates.push(candidate);
      candidatesByRule.set(candidate.ruleId, candidates);
      const edges = supersedesByRuleId.get(candidate.ruleId) ?? new Set<string>();
      for (const ruleId of candidate.supersedesRuleIds) {
        edges.add(ruleId);
      }
      supersedesByRuleId.set(candidate.ruleId, edges);
    }

    const keptByRule = new Map<string, Candidate>();
    for (const [ruleId, candidates] of candidatesByRule) {
      const [kept, ...extras] = [...candidates].sort((left, right) =>
        compareRecommendationMatches(left.match, right.match),
      );
      if (kept) {
        keptByRule.set(ruleId, kept);
      }
      for (const extra of extras) {
        dropped.add(extra);
      }
    }

    const ruleIds = [...candidatesByRule.keys()].sort((left, right) => left.localeCompare(right));
    const reachableByRule = new Map<string, Set<string>>();
    for (const ruleId of ruleIds) {
      const reachable = new Set<string>();
      const pending = [...(supersedesByRuleId.get(ruleId) ?? [])].filter((id) => candidatesByRule.has(id));
      while (pending.length > 0) {
        const next = pending.pop() as string;
        if (next === ruleId || reachable.has(next)) {
          continue;
        }
        reachable.add(next);
        for (const id of supersedesByRuleId.get(next) ?? []) {
          if (id !== ruleId && candidatesByRule.has(id) && !reachable.has(id)) {
            pending.push(id);
          }
        }
      }
      reachableByRule.set(ruleId, reachable);
    }

    const orderedRuleIds = [...ruleIds].sort(
      (left, right) =>
        (reachableByRule.get(right)?.size ?? 0) - (reachableByRule.get(left)?.size ?? 0) || left.localeCompare(right),
    );
    const suppressed = new Set<string>();
    for (const ruleId of orderedRuleIds) {
      if (suppressed.has(ruleId)) {
        continue;
      }
      for (const target of reachableByRule.get(ruleId) ?? []) {
        suppressed.add(target);
      }
    }
    for (const ruleId of suppressed) {
      const kept = keptByRule.get(ruleId);
      if (kept) {
        dropped.add(kept);
      }
    }
  }

  return evaluatedRules
    .map((result, resultIndex) => {
      if (!result.finding) {
        return result;
      }
      const retainedFindings = (candidatesByResult[resultIndex] ?? [])
        .filter((candidate) => !dropped.has(candidate))
        .map((candidate) => candidate.match)
        .sort(compareRecommendationMatches);
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
    })
    .sort((left, right) => left.provider.localeCompare(right.provider) || left.ruleId.localeCompare(right.ruleId));
};
