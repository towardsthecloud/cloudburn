import { describe, expect, it } from 'vitest';
import { applyFindingPrecedence, type EvaluatedRuleFinding } from '../src/engine/finding-precedence.js';

describe('action-specific precedence', () => {
  it.each(['Stop', undefined])('keeps a different or unknown native action (%s)', (actionType) => {
    const match = {
      resourceId: 'resource',
      resourceType: 'test:resource',
      accountId: '123456789012',
      region: 'eu-west-1',
    };
    const finding = {
      ruleId: 'hub',
      service: 'test',
      severity: 'medium' as const,
      source: 'discovery' as const,
      message: 'test',
      findings: [{ ...match, actionType: 'Delete' }],
    };
    const rules: EvaluatedRuleFinding[] = [
      { ruleId: 'hub', provider: 'aws', finding },
      {
        ruleId: 'native',
        provider: 'aws',
        supersedesRuleIds: ['hub'],
        finding: { ...finding, ruleId: 'native', findings: [{ ...match, actionType }] },
      },
    ];
    expect(applyFindingPrecedence(rules)[0]?.finding).toEqual(finding);
  });
});
