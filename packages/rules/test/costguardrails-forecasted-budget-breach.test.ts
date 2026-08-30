import { describe, expect, it } from 'vitest';
import { costGuardrailForecastedBudgetBreachRule } from '../src/aws/costguardrails/forecasted-budget-breach.js';
import type { AwsCostGuardrailBudget } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const budgetSummary: AwsCostGuardrailBudget = {
  accountId: '123456789012',
  budgetCount: 4,
  budgets: [
    {
      actualSpend: 75,
      budgetLimit: 100,
      budgetName: 'forecasted-breach',
      forecastedSpend: 125,
      spendUnit: 'USD',
    },
    {
      actualSpend: 125,
      budgetLimit: 100,
      budgetName: 'already-breached',
      forecastedSpend: 150,
      spendUnit: 'USD',
    },
    {
      actualSpend: 75,
      budgetLimit: 100,
      budgetName: 'forecast-equals-limit',
      forecastedSpend: 100,
      spendUnit: 'USD',
    },
    {
      actualSpend: 50,
      budgetLimit: 100,
      budgetName: 'missing-forecast',
      spendUnit: 'USD',
    },
  ],
};

describe('costGuardrailForecastedBudgetBreachRule', () => {
  it('flags only budgets forecast to breach before actual spend exceeds the limit', () => {
    const finding = costGuardrailForecastedBudgetBreachRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-cost-guardrail-budgets': [budgetSummary],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-COSTGUARDRAILS-4',
      service: 'costguardrails',
      severity: 'medium',
      source: 'discovery',
      message: 'AWS Budgets forecast to exceed their configured limit should be reviewed.',
      findings: [
        {
          accountId: '123456789012',
          resourceId: 'budget/forecasted-breach',
        },
      ],
    });
  });
});
