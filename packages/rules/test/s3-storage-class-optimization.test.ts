import { describe, expect, it } from 'vitest';
import { s3StorageClassOptimizationRule } from '../src/aws/s3/storage-class-optimization.js';
import type { AwsS3BucketAnalysis, AwsStaticS3BucketAnalysis } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const createBucketAnalysis = (overrides: Partial<AwsStaticS3BucketAnalysis> = {}): AwsStaticS3BucketAnalysis => ({
  hasAbortIncompleteMultipartUploadAfter7Days: false,
  hasAlternativeStorageClassTransition: false,
  hasCostFocusedLifecycle: false,
  hasIntelligentTieringConfiguration: false,
  hasIntelligentTieringTransition: false,
  hasLifecycleSignal: false,
  hasNoncurrentVersionCleanup: false,
  hasUnclassifiedTransition: false,
  location: {
    path: 'main.tf',
    line: 1,
    column: 1,
  },
  resourceId: 'aws_s3_bucket.logs',
  versioningEnabled: false,
  ...overrides,
});

const createLiveBucketAnalysis = (overrides: Partial<AwsS3BucketAnalysis> = {}): AwsS3BucketAnalysis => ({
  accountId: '123456789012',
  bucketName: 'logs-bucket',
  hasAbortIncompleteMultipartUploadAfter7Days: false,
  hasAlternativeStorageClassTransition: false,
  hasCostFocusedLifecycle: false,
  hasIntelligentTieringConfiguration: false,
  hasIntelligentTieringTransition: false,
  hasLifecycleSignal: false,
  hasUnclassifiedTransition: false,
  region: 'us-east-1',
  ...overrides,
});

describe('s3StorageClassOptimizationRule', () => {
  it('flags live buckets that never select a cheaper storage class', () => {
    const finding = s3StorageClassOptimizationRule.evaluateLive?.({
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

    expect(s3StorageClassOptimizationRule.discoveryDependencies).toEqual(['aws-s3-bucket-analyses']);
    expect(s3StorageClassOptimizationRule.staticDependencies).toEqual(['aws-s3-bucket-analyses']);
    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-S3-2',
      service: 's3',
      source: 'discovery',
      message: 'S3 buckets with lifecycle management should match object access patterns to the right storage class.',
      findings: [
        {
          resourceId: 'logs-bucket',
          region: 'us-east-1',
          accountId: '123456789012',
        },
      ],
    });
  });

  it('skips bare buckets with no lifecycle or tiering signal', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [createBucketAnalysis()],
      }),
    });

    expect(finding).toBeNull();
  });

  it('passes live buckets with an explicit Intelligent-Tiering strategy', () => {
    const finding = s3StorageClassOptimizationRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-s3-bucket-analyses': [
          createLiveBucketAnalysis({
            hasIntelligentTieringConfiguration: true,
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('flags buckets that only expire objects but never select a cheaper storage class', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [
          createBucketAnalysis({
            hasCostFocusedLifecycle: true,
            hasLifecycleSignal: true,
          }),
        ],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-S3-2',
      service: 's3',
      source: 'iac',
      message: 'S3 buckets with lifecycle management should match object access patterns to the right storage class.',
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

  it('flags CloudFormation buckets that only expire objects but never select a cheaper storage class', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [
          createBucketAnalysis({
            hasCostFocusedLifecycle: true,
            hasLifecycleSignal: true,
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
      ruleId: 'CLDBRN-AWS-S3-2',
      service: 's3',
      source: 'iac',
      message: 'S3 buckets with lifecycle management should match object access patterns to the right storage class.',
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

  it('passes buckets with an enabled transition to Intelligent-Tiering', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [
          createBucketAnalysis({
            hasCostFocusedLifecycle: true,
            hasIntelligentTieringTransition: true,
            hasLifecycleSignal: true,
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('passes buckets with inline lifecycle rules that use enabled = true', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [
          createBucketAnalysis({
            hasCostFocusedLifecycle: true,
            hasIntelligentTieringTransition: true,
            hasLifecycleSignal: true,
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('passes buckets with another explicit non-Standard storage class strategy', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [
          createBucketAnalysis({
            hasAlternativeStorageClassTransition: true,
            hasCostFocusedLifecycle: true,
            hasLifecycleSignal: true,
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('flags buckets when only disabled lifecycle rules transition to another storage class', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [
          createBucketAnalysis({
            hasLifecycleSignal: true,
          }),
        ],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-S3-2',
      service: 's3',
      source: 'iac',
      message: 'S3 buckets with lifecycle management should match object access patterns to the right storage class.',
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

  it('passes CloudFormation buckets with explicit Intelligent-Tiering configuration', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [
          createBucketAnalysis({
            hasIntelligentTieringConfiguration: true,
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

  it('passes Terraform buckets with an enabled Intelligent-Tiering configuration resource', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [
          createBucketAnalysis({
            hasIntelligentTieringConfiguration: true,
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('passes Terraform buckets when Intelligent-Tiering configuration omits status', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [
          createBucketAnalysis({
            hasIntelligentTieringConfiguration: true,
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips storage-class optimization findings when enabled transitions use computed storage classes', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [
          createBucketAnalysis({
            hasCostFocusedLifecycle: true,
            hasLifecycleSignal: true,
            hasUnclassifiedTransition: true,
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('passes buckets whose lifecycle configuration references aws_s3_bucket.<name>.bucket', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [
          createBucketAnalysis({
            hasCostFocusedLifecycle: true,
            hasIntelligentTieringTransition: true,
            hasLifecycleSignal: true,
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('flags generated-name buckets when linked lifecycle config only expires objects', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [
          createBucketAnalysis({
            hasCostFocusedLifecycle: true,
            hasLifecycleSignal: true,
            resourceId: 'aws_s3_bucket.generated_logs',
          }),
        ],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-S3-2',
      service: 's3',
      source: 'iac',
      message: 'S3 buckets with lifecycle management should match object access patterns to the right storage class.',
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
