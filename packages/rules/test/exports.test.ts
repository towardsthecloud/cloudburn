import { describe, expect, it } from 'vitest';
import { awsCorePreset, awsRules, azureRules, createRule, gcpRules, getAwsRuleCapabilities } from '../src/index.js';

const awsRuleIds = awsRules.map((rule) => rule.id);

describe('rule exports', () => {
  it('exports non-empty AWS rules and preset IDs', () => {
    expect(awsRuleIds).toHaveLength(93);
    expect(awsCorePreset.ruleIds).toEqual(
      awsRuleIds.filter(
        (ruleId) =>
          ![
            'CLDBRN-AWS-COSTOPTIMIZATIONHUB-1',
            'CLDBRN-AWS-COSTOPTIMIZATIONHUB-2',
            'CLDBRN-AWS-COSTOPTIMIZATIONHUB-4',
            'CLDBRN-AWS-COSTOPTIMIZATIONHUB-3',
            'CLDBRN-AWS-COSTOPTIMIZATIONHUB-5',
            'CLDBRN-AWS-COSTOPTIMIZATIONHUB-6',
            'CLDBRN-AWS-LAMBDA-4',
            'CLDBRN-AWS-TAGGING-1',
          ].includes(ruleId),
      ),
    );
  });

  it('derives sorted required capabilities from rule discovery dependencies', () => {
    const requireRule = (id: string) => {
      const rule = awsRules.find((candidate) => candidate.id === id);
      if (!rule) throw new Error(`Unknown rule ${id}`);
      return rule;
    };
    expect(getAwsRuleCapabilities(requireRule('CLDBRN-AWS-COSTOPTIMIZATIONHUB-1'))).toEqual([
      'cost-optimization-hub-enrollment',
    ]);
    expect(getAwsRuleCapabilities(requireRule('CLDBRN-AWS-LAMBDA-4'))).toEqual(['compute-optimizer-enrollment']);
    expect(getAwsRuleCapabilities(requireRule('CLDBRN-AWS-TAGGING-1'))).toEqual(['resource-explorer-aggregator']);

    const fixture = createRule({
      id: 'CLDBRN-AWS-TEST-CAPABILITIES',
      name: 'Capability fixture',
      description: 'Combines gated and ordinary datasets.',
      message: 'Review resources.',
      provider: 'aws',
      service: 'ec2',
      severity: 'medium',
      supports: ['discovery'],
      discoveryDependencies: [
        'aws-cost-optimization-hub-idle-recommendations',
        'aws-ebs-volumes',
        'aws-cost-optimization-hub-savings-plans-recommendations',
        'aws-lambda-memory-recommendations',
      ],
      evaluateLive: () => null,
    });
    expect(getAwsRuleCapabilities(fixture)).toEqual([
      'compute-optimizer-enrollment',
      'cost-optimization-hub-enrollment',
    ]);

    const optionalOnly = createRule({
      ...fixture,
      id: 'CLDBRN-AWS-TEST-OPTIONAL',
      discoveryDependencies: ['aws-sagemaker-savings-plans-coverage'],
      optionalDiscoveryDependencies: ['aws-cost-optimization-hub-savings-plans-recommendations'],
    });
    expect(getAwsRuleCapabilities(optionalOnly)).toEqual(['cost-explorer-access']);
    expect(getAwsRuleCapabilities(optionalOnly)).not.toContain('cost-optimization-hub-enrollment');

    const iacOnly = createRule({
      ...fixture,
      id: 'CLDBRN-AWS-TEST-IAC',
      supports: ['iac'],
      staticDependencies: ['aws-ebs-volumes'],
      evaluateLive: undefined,
      evaluateStatic: () => null,
    });
    expect(getAwsRuleCapabilities(iacOnly)).toEqual([]);
  });

  it('exports placeholder multi-cloud arrays', () => {
    expect(azureRules).toEqual([]);
    expect(gcpRules).toEqual([]);
  });
});
