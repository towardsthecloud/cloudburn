import { describe, expect, it } from 'vitest';
import { s3IncompleteMultipartUploadAbortRule } from '../src/aws/s3/incomplete-multipart-upload-abort.js';
import type { AwsS3BucketAnalysis, AwsStaticS3BucketAnalysis } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const createBucketAnalysis = (overrides: Partial<AwsStaticS3BucketAnalysis> = {}): AwsStaticS3BucketAnalysis => ({
  hasAbortIncompleteMultipartUploadAfter7Days: false,
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

describe('s3IncompleteMultipartUploadAbortRule', () => {
  it('flags live buckets without an enabled multipart abort rule within 7 days', () => {
    const finding = s3IncompleteMultipartUploadAbortRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-s3-bucket-analyses': [createLiveBucketAnalysis({ hasLifecycleSignal: true })],
      }),
    });

    expect(s3IncompleteMultipartUploadAbortRule.discoveryDependencies).toEqual(['aws-s3-bucket-analyses']);
    expect(s3IncompleteMultipartUploadAbortRule.staticDependencies).toEqual(['aws-s3-bucket-analyses']);
    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-S3-3',
      service: 's3',
      source: 'discovery',
      message: 'S3 buckets should abort incomplete multipart uploads within 7 days.',
      findings: [
        {
          resourceId: 'logs-bucket',
          region: 'us-east-1',
          accountId: '123456789012',
        },
      ],
    });
  });

  it('flags Terraform buckets without an enabled multipart abort rule within 7 days', () => {
    const finding = s3IncompleteMultipartUploadAbortRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [createBucketAnalysis({ hasLifecycleSignal: true })],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-S3-3',
      service: 's3',
      source: 'iac',
      message: 'S3 buckets should abort incomplete multipart uploads within 7 days.',
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

  it('passes live buckets with an enabled multipart abort rule within 7 days', () => {
    const finding = s3IncompleteMultipartUploadAbortRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-s3-bucket-analyses': [
          createLiveBucketAnalysis({
            hasAbortIncompleteMultipartUploadAfter7Days: true,
            hasLifecycleSignal: true,
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('passes CloudFormation buckets with an enabled multipart abort rule within 7 days', () => {
    const finding = s3IncompleteMultipartUploadAbortRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [
          createBucketAnalysis({
            hasAbortIncompleteMultipartUploadAfter7Days: true,
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

    expect(finding).toBeNull();
  });
});
