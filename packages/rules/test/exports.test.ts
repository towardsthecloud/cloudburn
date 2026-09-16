import { describe, expect, it } from 'vitest';
import {
  AWS_CAPABILITIES,
  AWS_CONFIG_RECORDING_FREQUENCY_MINIMUM_SAVINGS_USD,
  AWS_KMS_KEY_PROLIFERATION_THRESHOLD,
  AWS_KMS_MONTHLY_KEY_CREATION_THRESHOLD,
  AWS_KMS_UNUSED_KEY_MINIMUM_AGE_DAYS,
  AWS_SAGEMAKER_SAVINGS_PLANS_MINIMUM_COVERAGE_PERCENTAGE,
  AWS_SAGEMAKER_SAVINGS_PLANS_MINIMUM_UNCOVERED_COST,
  awsCorePreset,
  awsRules,
  azureRules,
  createFindingMatch,
  createLiveEvaluationCoverage,
  createRule,
  createStaticFindingMatch,
  gcpRules,
  getAwsCostOptimizationHubReservationResourceId,
  getAwsCostOptimizationHubReservationResourceType,
  getAwsDatasetCapability,
  getAwsRuleCapabilities,
  isRecord,
  LiveResourceBag,
  StaticResourceBag,
} from '../src/index.js';

const awsRuleIds = awsRules.map((rule) => rule.id);

describe('rule exports', () => {
  it('lets custom rules retain coverage alongside the existing grouped finding contract', () => {
    const resources = [
      { id: 'known', complete: true },
      { id: 'unavailable', complete: false },
    ];
    const customRule = createRule({
      id: 'CUSTOM-AWS-EXAMPLE-1',
      name: 'Custom example',
      description: 'Demonstrates custom evidence coverage.',
      message: 'Review matching resources.',
      provider: 'aws',
      service: 'example',
      severity: 'low',
      supports: ['discovery'],
      evaluateLive: () => null,
      getLiveEvaluationCoverage: () =>
        createLiveEvaluationCoverage(
          resources,
          (resource) => resource.complete,
          (resource) => createFindingMatch(resource.id),
        ),
    });
    const context = {
      catalog: { indexType: 'LOCAL' as const, resources: [], searchRegion: 'us-east-1' },
      resources: new LiveResourceBag(),
    };

    expect(customRule.evaluateLive?.(context)).toBeNull();
    expect(customRule.getLiveEvaluationCoverage?.(context)).toEqual({
      assessed: [{ resourceId: 'known' }],
      unknown: [{ resourceId: 'unavailable' }],
    });
  });

  it('exports non-empty AWS rules and preset IDs', () => {
    expect(AWS_CONFIG_RECORDING_FREQUENCY_MINIMUM_SAVINGS_USD).toBe(10);
    expect(AWS_KMS_KEY_PROLIFERATION_THRESHOLD).toBe(50);
    expect(AWS_KMS_MONTHLY_KEY_CREATION_THRESHOLD).toBe(10);
    expect(AWS_KMS_UNUSED_KEY_MINIMUM_AGE_DAYS).toBe(90);
    expect(AWS_SAGEMAKER_SAVINGS_PLANS_MINIMUM_COVERAGE_PERCENTAGE).toBe(80);
    expect(AWS_SAGEMAKER_SAVINGS_PLANS_MINIMUM_UNCOVERED_COST).toBe(72);
    expect(
      getAwsCostOptimizationHubReservationResourceId({
        recommendationId: 'recommendation-1',
        reservationType: 'RdsReservedInstances',
        resourceArn: 'arn:aws:rds:us-east-1:123456789012:db:orders',
        resourceId: undefined,
      }),
    ).toBe('orders');
    expect(getAwsCostOptimizationHubReservationResourceType({ reservationType: 'RdsReservedInstances' })).toBe(
      'rds:db',
    );
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
    expect(awsRuleIds).toEqual(
      expect.arrayContaining([
        'CLDBRN-AWS-CLOUDFRONT-1',
        'CLDBRN-AWS-CLOUDFRONT-2',
        'CLDBRN-AWS-CLOUDTRAIL-1',
        'CLDBRN-AWS-CLOUDTRAIL-2',
        'CLDBRN-AWS-CLOUDWATCH-1',
        'CLDBRN-AWS-CLOUDWATCH-2',
        'CLDBRN-AWS-CONFIG-1',
        'CLDBRN-AWS-COSTGUARDRAILS-1',
        'CLDBRN-AWS-COSTGUARDRAILS-2',
        'CLDBRN-AWS-COSTGUARDRAILS-3',
        'CLDBRN-AWS-COSTGUARDRAILS-4',
        'CLDBRN-AWS-COSTOPTIMIZATIONHUB-1',
        'CLDBRN-AWS-COSTOPTIMIZATIONHUB-2',
        'CLDBRN-AWS-COSTOPTIMIZATIONHUB-6',
        'CLDBRN-AWS-COSTEXPLORER-1',
        'CLDBRN-AWS-DYNAMODB-1',
        'CLDBRN-AWS-DYNAMODB-2',
        'CLDBRN-AWS-DYNAMODB-3',
        'CLDBRN-AWS-DYNAMODB-4',
        'CLDBRN-AWS-EC2-1',
        'CLDBRN-AWS-EC2-2',
        'CLDBRN-AWS-EC2-3',
        'CLDBRN-AWS-EC2-4',
        'CLDBRN-AWS-EC2-5',
        'CLDBRN-AWS-EC2-6',
        'CLDBRN-AWS-EC2-7',
        'CLDBRN-AWS-EC2-8',
        'CLDBRN-AWS-EC2-9',
        'CLDBRN-AWS-EC2-10',
        'CLDBRN-AWS-EC2-11',
        'CLDBRN-AWS-EC2-12',
        'CLDBRN-AWS-EC2-13',
        'CLDBRN-AWS-EC2-14',
        'CLDBRN-AWS-ECS-1',
        'CLDBRN-AWS-ECS-2',
        'CLDBRN-AWS-ECS-3',
        'CLDBRN-AWS-EBS-1',
        'CLDBRN-AWS-EBS-4',
        'CLDBRN-AWS-EBS-5',
        'CLDBRN-AWS-EBS-6',
        'CLDBRN-AWS-EBS-7',
        'CLDBRN-AWS-EBS-8',
        'CLDBRN-AWS-EBS-9',
        'CLDBRN-AWS-EBS-2',
        'CLDBRN-AWS-EBS-3',
        'CLDBRN-AWS-ECR-1',
        'CLDBRN-AWS-ECR-2',
        'CLDBRN-AWS-ECR-3',
        'CLDBRN-AWS-EKS-1',
        'CLDBRN-AWS-ELASTICACHE-1',
        'CLDBRN-AWS-ELASTICACHE-2',
        'CLDBRN-AWS-ELB-1',
        'CLDBRN-AWS-ELB-2',
        'CLDBRN-AWS-ELB-3',
        'CLDBRN-AWS-TAGGING-1',
        'CLDBRN-AWS-ELB-4',
        'CLDBRN-AWS-ELB-5',
        'CLDBRN-AWS-EMR-1',
        'CLDBRN-AWS-EMR-2',
        'CLDBRN-AWS-LAMBDA-2',
        'CLDBRN-AWS-LAMBDA-3',
        'CLDBRN-AWS-LAMBDA-4',
        'CLDBRN-AWS-KMS-1',
        'CLDBRN-AWS-KMS-2',
        'CLDBRN-AWS-RDS-1',
        'CLDBRN-AWS-RDS-2',
        'CLDBRN-AWS-RDS-3',
        'CLDBRN-AWS-RDS-4',
        'CLDBRN-AWS-RDS-5',
        'CLDBRN-AWS-RDS-6',
        'CLDBRN-AWS-RDS-7',
        'CLDBRN-AWS-RDS-8',
        'CLDBRN-AWS-RDS-9',
        'CLDBRN-AWS-RDS-10',
        'CLDBRN-AWS-REDSHIFT-1',
        'CLDBRN-AWS-REDSHIFT-2',
        'CLDBRN-AWS-REDSHIFT-3',
        'CLDBRN-AWS-ROUTE53-1',
        'CLDBRN-AWS-ROUTE53-2',
        'CLDBRN-AWS-S3-1',
        'CLDBRN-AWS-S3-2',
        'CLDBRN-AWS-S3-3',
        'CLDBRN-AWS-S3-4',
        'CLDBRN-AWS-SAGEMAKER-1',
        'CLDBRN-AWS-SAGEMAKER-2',
        'CLDBRN-AWS-SAGEMAKER-3',
        'CLDBRN-AWS-SECRETSMANAGER-1',
      ]),
    );
  });

  it('exports shared helpers used by built-in AWS rules', () => {
    expect(createFindingMatch).toBeTypeOf('function');
    expect(createStaticFindingMatch).toBeTypeOf('function');
    expect(isRecord).toBeTypeOf('function');
    expect(LiveResourceBag).toBeTypeOf('function');
    expect(StaticResourceBag).toBeTypeOf('function');
  });

  it('exports the bounded AWS capability catalog', () => {
    expect(AWS_CAPABILITIES).toEqual([
      'cost-optimization-hub-enrollment',
      'compute-optimizer-enrollment',
      'resource-explorer-aggregator',
      'cost-explorer-access',
      'budgets-access',
    ]);
  });

  it('maps setup-gated datasets to their AWS capability', () => {
    for (const datasetKey of [
      'aws-cost-optimization-hub-savings-plans-recommendations',
      'aws-cost-optimization-hub-reservation-recommendations',
      'aws-cost-optimization-hub-rightsizing-recommendations',
      'aws-cost-optimization-hub-idle-recommendations',
      'aws-cost-optimization-hub-upgrade-recommendations',
      'aws-cost-optimization-hub-graviton-recommendations',
    ] as const) {
      expect(getAwsDatasetCapability(datasetKey), datasetKey).toBe('cost-optimization-hub-enrollment');
    }
    expect(getAwsDatasetCapability('aws-lambda-memory-recommendations')).toBe('compute-optimizer-enrollment');
    expect(getAwsDatasetCapability('aws-resource-explorer-untagged-resources')).toBe('resource-explorer-aggregator');
    expect(getAwsDatasetCapability('aws-cost-usage')).toBe('cost-explorer-access');
    expect(getAwsDatasetCapability('aws-cost-anomaly-monitors')).toBe('cost-explorer-access');
    expect(getAwsDatasetCapability('aws-sagemaker-savings-plans-coverage')).toBe('cost-explorer-access');
    expect(getAwsDatasetCapability('aws-cost-guardrail-budgets')).toBe('budgets-access');
    expect(getAwsDatasetCapability('aws-ebs-volumes')).toBeUndefined();
    expect(getAwsDatasetCapability('aws-lambda-functions')).toBeUndefined();
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
