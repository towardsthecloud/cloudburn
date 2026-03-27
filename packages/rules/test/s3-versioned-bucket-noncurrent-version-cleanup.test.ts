import { describe, expect, it } from 'vitest';
import { s3VersionedBucketNoncurrentVersionCleanupRule } from '../src/aws/s3/versioned-bucket-noncurrent-version-cleanup.js';
import type { AwsStaticS3BucketAnalysis } from '../src/index.js';
import { StaticResourceBag } from '../src/index.js';

const createBucket = (overrides: Partial<AwsStaticS3BucketAnalysis> = {}): AwsStaticS3BucketAnalysis => ({
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
  versioningEnabled: true,
  ...overrides,
});

describe('s3VersionedBucketNoncurrentVersionCleanupRule', () => {
  it('flags versioned buckets without noncurrent cleanup', () => {
    const finding = s3VersionedBucketNoncurrentVersionCleanupRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [createBucket()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-S3-4',
      service: 's3',
      source: 'iac',
      message: 'Versioned S3 buckets should define noncurrent-version cleanup.',
      findings: [
        {
          location: {
            path: 'main.tf',
            line: 1,
            column: 1,
          },
          resourceId: 'aws_s3_bucket.logs',
        },
      ],
    });
  });

  it('skips buckets with noncurrent cleanup or no versioning', () => {
    const finding = s3VersionedBucketNoncurrentVersionCleanupRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-s3-bucket-analyses': [
          createBucket({ hasNoncurrentVersionCleanup: true }),
          createBucket({ resourceId: 'LogsBucket', versioningEnabled: false }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
