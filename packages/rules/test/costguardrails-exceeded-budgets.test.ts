import { describe, expect, it } from 'vitest';
import { costGuardrailExceededBudgetsRule } from '../src/aws/costguardrails/exceeded-budgets.js';
import type { AwsCostGuardrailBudget } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createBudgetSummary = (overrides: Partial<AwsCostGuardrailBudget> = {}): AwsCostGuardrailBudget => ({
  accountId: '123456789012',
  budgetCount: 2,
  budgets: [
    {
      actualSpend: 125,
      budgetLimit: 100,
      budgetName: 'monthly-spend',
      forecastedSpend: 150,
      spendUnit: 'USD',
    },
    {
      actualSpend: 100,
      budgetLimit: 100,
      budgetName: 'equal-spend',
      spendUnit: 'USD',
    },
  ],
  ...overrides,
});

describe('costGuardrailExceededBudgetsRule', () => {
  it('groups budgets whose actual spend strictly exceeds their limit', () => {
    const finding = costGuardrailExceededBudgetsRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-cost-guardrail-budgets': [createBudgetSummary()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-COSTGUARDRAILS-3',
      service: 'costguardrails',
      source: 'discovery',
      message: 'AWS Budgets whose actual spend exceeds their configured limit should be reviewed.',
      findings: [
        {
          accountId: '123456789012',
          resourceId: 'budget/monthly-spend',
        },
      ],
    });
  });

  it('returns null when no budget exceeds its limit', () => {
    const finding = costGuardrailExceededBudgetsRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-cost-guardrail-budgets': [
          createBudgetSummary({
            budgets: [
              {
                actualSpend: 75,
                budgetLimit: 100,
                budgetName: 'monthly-spend',
                forecastedSpend: 110,
                spendUnit: 'USD',
              },
            ],
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
