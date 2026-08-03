import { describe, expect, it } from 'vitest';
import { s3IntelligentTieringRecommendationRule } from '../src/aws/s3/intelligent-tiering-recommendation.js';
import type { AwsS3BucketAnalysis, AwsStaticS3BucketAnalysis } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const RULE_MESSAGE =
  'S3 buckets without any storage-class transition should enable Intelligent-Tiering when access patterns are unknown.';

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

describe('s3IntelligentTieringRecommendationRule', () => {
  it('flags live buckets with no lifecycle configuration and no Intelligent-Tiering configuration', () => {
    const finding = s3IntelligentTieringRecommendationRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-s3-bucket-analyses': [createLiveBucketAnalysis()],
      }),
    });

    expect(s3IntelligentTieringRecommendationRule.discoveryDependencies).toEqual(['aws-s3-bucket-analyses']);
    expect(s3IntelligentTieringRecommendationRule.staticDependencies).toEqual(['aws-s3-bucket-analyses']);
    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-S3-5',
      service: 's3',
      severity: 'low',
      source: 'discovery',
      message: RULE_MESSAGE,
      findings: [
        {
          resourceId: 'logs-bucket',
          region: 'us-east-1',
          accountId: '123456789012',
        },
      ],
    });
  });

  it('passes live buckets that already have an Intelligent-Tiering configuration', () => {
    const finding = s3IntelligentTieringRecommendationRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-s3-bucket-analyses': [createLiveBucketAnalysis({ hasIntelligentTieringConfiguration: true })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('passes live buckets with lifecycle rules so CLDBRN-AWS-S3-2 keeps ownership of them', () => {
    const finding = s3IntelligentTieringRecommendationRule.evaluateLive?.({
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

  it('flags Terraform buckets with no lifecycle configuration and no Intelligent-Tiering configuration', () => {
    const finding = s3IntelligentTieringRecommendationRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [createBucketAnalysis()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-S3-5',
      service: 's3',
      severity: 'low',
      source: 'iac',
      message: RULE_MESSAGE,
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

  it('flags CloudFormation buckets with no lifecycle configuration and no Intelligent-Tiering configuration', () => {
    const finding = s3IntelligentTieringRecommendationRule.evaluateStatic?.({
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
      ruleId: 'CLDBRN-AWS-S3-5',
      service: 's3',
      severity: 'low',
      source: 'iac',
      message: RULE_MESSAGE,
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

  it('passes Terraform buckets that already declare an Intelligent-Tiering configuration', () => {
    const finding = s3IntelligentTieringRecommendationRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [createBucketAnalysis({ hasIntelligentTieringConfiguration: true })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('returns null when there are no buckets to evaluate', () => {
    const finding = s3IntelligentTieringRecommendationRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [],
      }),
    });

    expect(finding).toBeNull();
  });
});
