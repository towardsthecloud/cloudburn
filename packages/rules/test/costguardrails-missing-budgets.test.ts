import { describe, expect, it } from 'vitest';
import { costGuardrailMissingBudgetsRule } from '../src/aws/costguardrails/missing-budgets.js';
import type { AwsCostGuardrailBudget } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createBudget = (overrides: Partial<AwsCostGuardrailBudget> = {}): AwsCostGuardrailBudget => ({
  accountId: '123456789012',
  budgetCount: 1,
  ...overrides,
});

describe('costGuardrailMissingBudgetsRule', () => {
  it('emits an account-level finding when no budgets exist', () => {
    const finding = costGuardrailMissingBudgetsRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-cost-guardrail-budgets': [createBudget({ budgetCount: 0 })],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-COSTGUARDRAILS-1',
      service: 'costguardrails',
      source: 'discovery',
      message: 'AWS accounts should define at least one AWS Budget for spend guardrails.',
      findings: [
        {
          accountId: '123456789012',
          resourceId: '123456789012',
        },
      ],
    });
  });

  it('skips accounts that already have budgets', () => {
    const finding = costGuardrailMissingBudgetsRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-cost-guardrail-budgets': [createBudget()],
      }),
    });

    expect(finding).toBeNull();
  });
});
