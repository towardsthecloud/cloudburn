import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-COSTGUARDRAILS-3';
const RULE_SERVICE = 'costguardrails';
const RULE_MESSAGE = 'AWS Budgets whose actual spend exceeds their configured limit should be reviewed.';

/** Flag configured AWS Budgets whose actual spend strictly exceeds their limit. */
export const costGuardrailExceededBudgetsRule = createRule({
  id: RULE_ID,
  name: 'AWS Budget Limit Exceeded',
  description: 'Flag AWS Budgets whose actual spend is greater than their configured limit.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-cost-guardrail-budgets'],
  evaluateLive: ({ resources }) => {
    const budgetSummary = resources.get('aws-cost-guardrail-budgets')[0];

    if (!budgetSummary?.budgets) {
      return null;
    }

    const findings = budgetSummary.budgets
      .filter((budget) => budget.actualSpend > budget.budgetLimit)
      .map((budget) => createFindingMatch(`budget/${budget.budgetName}`, undefined, budgetSummary.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
