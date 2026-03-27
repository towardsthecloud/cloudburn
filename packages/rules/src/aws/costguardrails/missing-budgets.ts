import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-COSTGUARDRAILS-1';
const RULE_SERVICE = 'costguardrails';
const RULE_MESSAGE = 'AWS accounts should define at least one AWS Budget for spend guardrails.';

/** Flag accounts that have not configured any AWS Budgets. */
export const costGuardrailMissingBudgetsRule = createRule({
  id: RULE_ID,
  name: 'AWS Budgets Missing',
  description: 'Flag AWS accounts that do not have any AWS Budgets configured.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-cost-guardrail-budgets'],
  evaluateLive: ({ resources }) => {
    const budgetSummary = resources.get('aws-cost-guardrail-budgets')[0];

    if (!budgetSummary || budgetSummary.budgetCount > 0) {
      return null;
    }

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', [
      createFindingMatch(budgetSummary.accountId, undefined, budgetSummary.accountId),
    ]);
  },
});
