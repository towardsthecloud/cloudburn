import { describe, expect, it } from 'vitest';
import {
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
  createStaticFindingMatch,
  gcpRules,
  getAwsCostOptimizationHubReservationResourceId,
  getAwsCostOptimizationHubReservationResourceType,
  isRecord,
  LiveResourceBag,
  StaticResourceBag,
} from '../src/index.js';

const awsRuleIds = awsRules.map((rule) => rule.id);

describe('rule exports', () => {
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

  it('exports placeholder multi-cloud arrays', () => {
    expect(azureRules).toEqual([]);
    expect(gcpRules).toEqual([]);
  });
});
