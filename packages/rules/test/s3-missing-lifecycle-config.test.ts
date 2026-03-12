import { describe, expect, it } from 'vitest';
import { s3MissingLifecycleConfigRule } from '../src/aws/s3/missing-lifecycle-config.js';
import type { AwsS3BucketAnalysis, AwsStaticS3BucketAnalysis } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const createBucketAnalysis = (overrides: Partial<AwsStaticS3BucketAnalysis> = {}): AwsStaticS3BucketAnalysis => ({
  hasAlternativeStorageClassTransition: false,
  hasCostFocusedLifecycle: false,
  hasIntelligentTieringConfiguration: false,
  hasIntelligentTieringTransition: false,
  hasLifecycleSignal: false,
  hasUnclassifiedTransition: false,
  location: {
    path: 'main.tf',
    line: 1,
    column: 1,
  },
  resourceId: 'aws_s3_bucket.logs',
  ...overrides,
});

const createLiveBucketAnalysis = (overrides: Partial<AwsS3BucketAnalysis> = {}): AwsS3BucketAnalysis => ({
  accountId: '123456789012',
  bucketName: 'logs-bucket',
  hasAlternativeStorageClassTransition: false,
  hasCostFocusedLifecycle: false,
  hasIntelligentTieringConfiguration: false,
  hasIntelligentTieringTransition: false,
  hasLifecycleSignal: false,
  hasUnclassifiedTransition: false,
  region: 'us-east-1',
  ...overrides,
});

describe('s3MissingLifecycleConfigRule', () => {
  it('flags live buckets without a lifecycle configuration', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-s3-bucket-analyses': [createLiveBucketAnalysis()],
      }),
    });

    expect(s3MissingLifecycleConfigRule.discoveryDependencies).toEqual(['aws-s3-bucket-analyses']);
    expect(s3MissingLifecycleConfigRule.staticDependencies).toEqual(['aws-s3-bucket-analyses']);
    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-S3-1',
      service: 's3',
      source: 'discovery',
      message: 'S3 buckets should define lifecycle management policies.',
      findings: [
        {
          resourceId: 'logs-bucket',
          region: 'us-east-1',
          accountId: '123456789012',
        },
      ],
    });
  });

  it('flags Terraform buckets without a lifecycle configuration', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [createBucketAnalysis()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-S3-1',
      service: 's3',
      source: 'iac',
      message: 'S3 buckets should define lifecycle management policies.',
      findings: [
        {
          resourceId: 'aws_s3_bucket.logs',
          location: {
            path: 'main.tf',
            line: 1,
            column: 1,
          },
        },
      ],
    });
  });

  it('flags CloudFormation buckets without a lifecycle configuration', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [
          createBucketAnalysis({
            location: {
              path: 'template.yaml',
              line: 3,
              column: 3,
            },
            resourceId: 'LogsBucket',
          }),
        ],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-S3-1',
      service: 's3',
      source: 'iac',
      message: 'S3 buckets should define lifecycle management policies.',
      findings: [
        {
          resourceId: 'LogsBucket',
          location: {
            path: 'template.yaml',
            line: 3,
            column: 3,
          },
        },
      ],
    });
  });

  it('passes Terraform buckets with an enabled lifecycle transition rule', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [createBucketAnalysis({ hasCostFocusedLifecycle: true, hasLifecycleSignal: true })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('passes live buckets with an enabled lifecycle rule', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-s3-bucket-analyses': [
          createLiveBucketAnalysis({
            hasCostFocusedLifecycle: true,
            hasLifecycleSignal: true,
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('passes Terraform buckets with inline lifecycle rules that use enabled = true', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [createBucketAnalysis({ hasCostFocusedLifecycle: true, hasLifecycleSignal: true })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('passes Terraform buckets whose lifecycle configuration references aws_s3_bucket.<name>.bucket', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [createBucketAnalysis({ hasCostFocusedLifecycle: true, hasLifecycleSignal: true })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('passes Terraform buckets with generated names when linked lifecycle config uses aws_s3_bucket.<name>.id', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [createBucketAnalysis({ hasCostFocusedLifecycle: true, hasLifecycleSignal: true })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('flags Terraform buckets when lifecycle rules are enabled but do not transition or expire objects', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [createBucketAnalysis({ hasLifecycleSignal: true })],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-S3-1',
      service: 's3',
      source: 'iac',
      message: 'S3 buckets should define lifecycle management policies.',
      findings: [
        {
          resourceId: 'aws_s3_bucket.logs',
          location: {
            path: 'main.tf',
            line: 1,
            column: 1,
          },
        },
      ],
    });
  });

  it('passes Terraform buckets with enabled transition actions even when the storage class is computed', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [
          createBucketAnalysis({ hasCostFocusedLifecycle: true, hasUnclassifiedTransition: true }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('passes CloudFormation buckets with an enabled expiration lifecycle rule', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [
          createBucketAnalysis({
            hasCostFocusedLifecycle: true,
            location: {
              path: 'template.yaml',
              line: 3,
              column: 3,
            },
            resourceId: 'LogsBucket',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('flags Terraform buckets with generated names when no lifecycle config exists', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [
          createBucketAnalysis({
            resourceId: 'aws_s3_bucket.generated_logs',
          }),
        ],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-S3-1',
      service: 's3',
      source: 'iac',
      message: 'S3 buckets should define lifecycle management policies.',
      findings: [
        {
          resourceId: 'aws_s3_bucket.generated_logs',
          location: {
            path: 'main.tf',
            line: 1,
            column: 1,
          },
        },
      ],
    });
  });
});
