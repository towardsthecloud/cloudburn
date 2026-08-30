import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-COSTGUARDRAILS-4';
const RULE_SERVICE = 'costguardrails';
const RULE_SEVERITY = 'medium' as const;
const RULE_MESSAGE = 'AWS Budgets forecast to exceed their configured limit should be reviewed.';

/** Flag AWS Budgets forecast to breach their limit before actual spend exceeds it. */
export const costGuardrailForecastedBudgetBreachRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'AWS Budget Forecasted Breach',
  description: 'Flag AWS Budgets whose forecasted spend exceeds their limit before actual spend does.',
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
      .filter(
        (budget) =>
          budget.actualSpend <= budget.budgetLimit &&
          budget.forecastedSpend !== undefined &&
          budget.forecastedSpend > budget.budgetLimit,
      )
      .map((budget) => createFindingMatch(`budget/${budget.budgetName}`, undefined, budgetSummary.accountId));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
