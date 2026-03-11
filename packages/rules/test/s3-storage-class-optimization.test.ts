import { describe, expect, it } from 'vitest';
import { s3StorageClassOptimizationRule } from '../src/aws/s3/storage-class-optimization.js';
import type { IaCResource } from '../src/index.js';

const createTerraformBucket = (overrides: Partial<IaCResource> = {}): IaCResource => ({
  provider: 'aws',
  type: 'aws_s3_bucket',
  name: 'logs',
  location: {
    path: 'main.tf',
    startLine: 1,
    startColumn: 1,
  },
  attributeLocations: {
    bucket: {
      path: 'main.tf',
      startLine: 2,
      startColumn: 3,
    },
  },
  attributes: {
    bucket: 'example-logs',
  },
  ...overrides,
});

const createTerraformLifecycleConfiguration = (overrides: Partial<IaCResource> = {}): IaCResource => ({
  provider: 'aws',
  type: 'aws_s3_bucket_lifecycle_configuration',
  name: 'logs',
  location: {
    path: 'main.tf',
    startLine: 5,
    startColumn: 1,
  },
  attributeLocations: {
    bucket: {
      path: 'main.tf',
      startLine: 6,
      startColumn: 3,
    },
    rule: {
      path: 'main.tf',
      startLine: 8,
      startColumn: 3,
    },
  },
  attributes: {
    bucket: '${' + 'aws_s3_bucket.logs.id}',
    rule: [
      {
        id: 'expire-old-data',
        status: 'Enabled',
        expiration: [
          {
            days: 30,
          },
        ],
      },
    ],
  },
  ...overrides,
});

const createTerraformIntelligentTieringConfiguration = (overrides: Partial<IaCResource> = {}): IaCResource => ({
  provider: 'aws',
  type: 'aws_s3_bucket_intelligent_tiering_configuration',
  name: 'logs',
  location: {
    path: 'main.tf',
    startLine: 20,
    startColumn: 1,
  },
  attributeLocations: {
    bucket: {
      path: 'main.tf',
      startLine: 21,
      startColumn: 3,
    },
    status: {
      path: 'main.tf',
      startLine: 22,
      startColumn: 3,
    },
  },
  attributes: {
    bucket: '${' + 'aws_s3_bucket.logs.id}',
    status: 'Enabled',
  },
  ...overrides,
});

const createCloudFormationBucket = (overrides: Partial<IaCResource> = {}): IaCResource => ({
  provider: 'aws',
  type: 'AWS::S3::Bucket',
  name: 'LogsBucket',
  location: {
    path: 'template.yaml',
    startLine: 3,
    startColumn: 3,
  },
  attributeLocations: {
    'Properties.LifecycleConfiguration': {
      path: 'template.yaml',
      startLine: 6,
      startColumn: 7,
    },
    'Properties.IntelligentTieringConfigurations': {
      path: 'template.yaml',
      startLine: 14,
      startColumn: 7,
    },
  },
  attributes: {
    Properties: {
      BucketName: 'logs-bucket',
      LifecycleConfiguration: {
        Rules: [
          {
            Id: 'expire-old-logs',
            Status: 'Enabled',
            ExpirationInDays: 30,
          },
        ],
      },
    },
  },
  ...overrides,
});

describe('s3StorageClassOptimizationRule', () => {
  it('skips bare buckets with no lifecycle or tiering signal', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      iacResources: [createTerraformBucket()],
    });

    expect(finding).toBeNull();
  });

  it('flags buckets that only expire objects but never select a cheaper storage class', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      iacResources: [createTerraformBucket(), createTerraformLifecycleConfiguration()],
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
            startLine: 1,
            startColumn: 1,
          },
        },
      ],
    });
  });

  it('passes buckets with an enabled transition to Intelligent-Tiering', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      iacResources: [
        createTerraformBucket(),
        createTerraformLifecycleConfiguration({
          attributes: {
            bucket: '${' + 'aws_s3_bucket.logs.id}',
            rule: [
              {
                id: 'tier-logs',
                status: 'Enabled',
                transition: [
                  {
                    days: 30,
                    storage_class: 'INTELLIGENT_TIERING',
                  },
                ],
              },
            ],
          },
        }),
      ],
    });

    expect(finding).toBeNull();
  });

  it('passes buckets with inline lifecycle rules that use enabled = true', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      iacResources: [
        createTerraformBucket({
          attributes: {
            bucket: 'example-logs',
            lifecycle_rule: [
              {
                id: 'tier-logs',
                enabled: true,
                transition: [
                  {
                    days: 30,
                    storage_class: 'INTELLIGENT_TIERING',
                  },
                ],
              },
            ],
          },
        }),
      ],
    });

    expect(finding).toBeNull();
  });

  it('passes buckets with another explicit non-Standard storage class strategy', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      iacResources: [
        createTerraformBucket(),
        createTerraformLifecycleConfiguration({
          attributes: {
            bucket: '${' + 'aws_s3_bucket.logs.id}',
            rule: [
              {
                id: 'archive-logs',
                status: 'Enabled',
                transition: [
                  {
                    days: 90,
                    storage_class: 'GLACIER',
                  },
                ],
              },
            ],
          },
        }),
      ],
    });

    expect(finding).toBeNull();
  });

  it('flags buckets when only disabled lifecycle rules transition to another storage class', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      iacResources: [
        createTerraformBucket(),
        createTerraformLifecycleConfiguration({
          attributes: {
            bucket: '${' + 'aws_s3_bucket.logs.id}',
            rule: [
              {
                id: 'expire-logs',
                status: 'Enabled',
                expiration: [
                  {
                    days: 30,
                  },
                ],
              },
              {
                id: 'archive-logs',
                status: 'Disabled',
                transition: [
                  {
                    days: 90,
                    storage_class: 'GLACIER',
                  },
                ],
              },
            ],
          },
        }),
      ],
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
            startLine: 1,
            startColumn: 1,
          },
        },
      ],
    });
  });

  it('passes CloudFormation buckets with explicit Intelligent-Tiering configuration', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      iacResources: [
        createCloudFormationBucket({
          attributes: {
            Properties: {
              BucketName: 'logs-bucket',
              LifecycleConfiguration: {
                Rules: [
                  {
                    Id: 'expire-old-logs',
                    Status: 'Enabled',
                    ExpirationInDays: 30,
                  },
                ],
              },
              IntelligentTieringConfigurations: [
                {
                  Id: 'archive-old-logs',
                  Status: 'Enabled',
                  Tierings: [
                    {
                      AccessTier: 'ARCHIVE_ACCESS',
                      Days: 90,
                    },
                  ],
                },
              ],
            },
          },
        }),
      ],
    });

    expect(finding).toBeNull();
  });

  it('passes Terraform buckets with an enabled Intelligent-Tiering configuration resource', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      iacResources: [
        createTerraformBucket(),
        createTerraformLifecycleConfiguration(),
        createTerraformIntelligentTieringConfiguration(),
      ],
    });

    expect(finding).toBeNull();
  });

  it('passes Terraform buckets when Intelligent-Tiering configuration omits status', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      iacResources: [
        createTerraformBucket(),
        createTerraformLifecycleConfiguration(),
        createTerraformIntelligentTieringConfiguration({
          attributeLocations: {
            bucket: {
              path: 'main.tf',
              startLine: 21,
              startColumn: 3,
            },
          },
          attributes: {
            bucket: '${' + 'aws_s3_bucket.logs.id}',
          },
        }),
      ],
    });

    expect(finding).toBeNull();
  });

  it('skips storage-class optimization findings when enabled transitions use computed storage classes', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      iacResources: [
        createTerraformBucket(),
        createTerraformLifecycleConfiguration({
          attributes: {
            bucket: '${' + 'aws_s3_bucket.logs.id}',
            rule: [
              {
                id: 'transition',
                status: 'Enabled',
                transition: [
                  {
                    days: 30,
                    storage_class: '${' + 'var.storage_class}',
                  },
                ],
              },
            ],
          },
        }),
      ],
    });

    expect(finding).toBeNull();
  });

  it('passes buckets whose lifecycle configuration references aws_s3_bucket.<name>.bucket', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      iacResources: [
        createTerraformBucket(),
        createTerraformLifecycleConfiguration({
          attributes: {
            bucket: '${' + 'aws_s3_bucket.logs.bucket}',
            rule: [
              {
                id: 'tier-logs',
                status: 'Enabled',
                transition: [
                  {
                    days: 30,
                    storage_class: 'INTELLIGENT_TIERING',
                  },
                ],
              },
            ],
          },
        }),
      ],
    });

    expect(finding).toBeNull();
  });

  it('flags generated-name buckets when linked lifecycle config only expires objects', () => {
    const finding = s3StorageClassOptimizationRule.evaluateStatic?.({
      iacResources: [
        createTerraformBucket({
          attributes: {
            bucket_prefix: 'logs-',
          },
          attributeLocations: {
            bucket_prefix: {
              path: 'main.tf',
              startLine: 2,
              startColumn: 3,
            },
          },
        }),
        createTerraformLifecycleConfiguration(),
      ],
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
            startLine: 1,
            startColumn: 1,
          },
        },
      ],
    });
  });
});
