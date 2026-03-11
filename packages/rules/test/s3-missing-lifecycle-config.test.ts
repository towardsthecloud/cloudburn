import { describe, expect, it } from 'vitest';
import { s3MissingLifecycleConfigRule } from '../src/aws/s3/missing-lifecycle-config.js';
import type { IaCResource, StaticEvaluationContext } from '../src/index.js';

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
        id: 'transition',
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
    'Properties.BucketName': {
      path: 'template.yaml',
      startLine: 5,
      startColumn: 7,
    },
    'Properties.LifecycleConfiguration': {
      path: 'template.yaml',
      startLine: 6,
      startColumn: 7,
    },
  },
  attributes: {
    Properties: {
      BucketName: 'logs-bucket',
    },
  },
  ...overrides,
});

describe('s3MissingLifecycleConfigRule', () => {
  it('flags Terraform buckets without a lifecycle configuration', () => {
    const staticContext = {
      iacResources: [createTerraformBucket()],
    } satisfies StaticEvaluationContext;

    const finding = s3MissingLifecycleConfigRule.evaluateStatic?.(staticContext);

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
            startLine: 1,
            startColumn: 1,
          },
        },
      ],
    });
  });

  it('passes Terraform buckets with an enabled lifecycle transition rule', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateStatic?.({
      iacResources: [createTerraformBucket(), createTerraformLifecycleConfiguration()],
    });

    expect(finding).toBeNull();
  });

  it('passes Terraform buckets with inline lifecycle rules that use enabled = true', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateStatic?.({
      iacResources: [
        createTerraformBucket({
          attributes: {
            bucket: 'example-logs',
            lifecycle_rule: [
              {
                id: 'transition',
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

  it('passes Terraform buckets whose lifecycle configuration references aws_s3_bucket.<name>.bucket', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateStatic?.({
      iacResources: [
        createTerraformBucket(),
        createTerraformLifecycleConfiguration({
          attributes: {
            bucket: '${' + 'aws_s3_bucket.logs.bucket}',
            rule: [
              {
                id: 'transition',
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

  it('passes Terraform buckets with generated names when linked lifecycle config uses aws_s3_bucket.<name>.id', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateStatic?.({
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

    expect(finding).toBeNull();
  });

  it('flags Terraform buckets when lifecycle rules are enabled but do not transition or expire objects', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateStatic?.({
      iacResources: [
        createTerraformBucket(),
        createTerraformLifecycleConfiguration({
          attributes: {
            bucket: '${' + 'aws_s3_bucket.logs.id}',
            rule: [
              {
                id: 'metadata-only',
                status: 'Enabled',
                filter: [
                  {
                    prefix: 'logs/',
                  },
                ],
              },
            ],
          },
        }),
      ],
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
            startLine: 1,
            startColumn: 1,
          },
        },
      ],
    });
  });

  it('passes Terraform buckets with enabled transition actions even when the storage class is computed', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateStatic?.({
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

  it('passes CloudFormation buckets with an enabled expiration lifecycle rule', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateStatic?.({
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
            },
          },
        }),
      ],
    });

    expect(finding).toBeNull();
  });

  it('flags Terraform buckets with generated names when no lifecycle config exists', () => {
    const finding = s3MissingLifecycleConfigRule.evaluateStatic?.({
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
      ],
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
            startLine: 1,
            startColumn: 1,
          },
        },
      ],
    });
  });
});
