import type { IaCResource, Rule } from '@cloudburn/rules';
import { StaticResourceBag } from '@cloudburn/rules';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseIaC } from '../../src/parsers/index.js';
import { loadAwsStaticResources } from '../../src/providers/aws/static.js';
import { getAwsStaticDatasetDefinition } from '../../src/providers/aws/static-registry.js';

vi.mock('../../src/parsers/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/parsers/index.js')>('../../src/parsers/index.js');

  return {
    ...actual,
    parseIaC: vi.fn(),
  };
});

const mockedParseIaC = vi.mocked(parseIaC);

const createRule = (overrides: Partial<Rule> = {}): Rule => ({
  description: 'test rule',
  evaluateStatic: () => null,
  id: 'CLDBRN-AWS-TEST-1',
  message: 'test rule',
  name: 'test rule',
  provider: 'aws',
  service: 'ec2',
  supports: ['iac'],
  ...overrides,
});

const createIaCResource = (overrides: Partial<IaCResource> = {}): IaCResource => ({
  provider: 'aws',
  type: 'aws_instance',
  name: 'example',
  attributes: {},
  ...overrides,
});

describe('loadAwsStaticResources', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('loads unique static datasets once and builds a StaticResourceBag', async () => {
    mockedParseIaC.mockResolvedValue([
      createIaCResource({
        type: 'aws_ebs_volume',
        name: 'logs',
        attributeLocations: {
          type: {
            path: 'main.tf',
            line: 4,
            column: 3,
          },
        },
        attributes: {
          type: 'gp2',
        },
      }),
      createIaCResource({
        type: 'AWS::EC2::Instance',
        name: 'AppServer',
        attributeLocations: {
          'Properties.InstanceType': {
            path: 'template.yaml',
            line: 8,
            column: 7,
          },
        },
        attributes: {
          Properties: {
            InstanceType: 'c6i.large',
          },
        },
      }),
    ]);

    const result = await loadAwsStaticResources('/tmp/iac', [
      createRule({
        staticDependencies: ['aws-ebs-volumes'],
      }),
      createRule({
        id: 'CLDBRN-AWS-TEST-2',
        staticDependencies: ['aws-ec2-instances', 'aws-ebs-volumes'],
      }),
    ]);

    expect(mockedParseIaC).toHaveBeenCalledWith('/tmp/iac', {
      sourceKinds: ['cloudformation', 'terraform'],
    });
    expect(result.resources).toBeInstanceOf(StaticResourceBag);
    expect(result.resources.get('aws-ebs-volumes')).toEqual([
      {
        location: {
          path: 'main.tf',
          line: 4,
          column: 3,
        },
        resourceId: 'aws_ebs_volume.logs',
        volumeType: 'gp2',
      },
    ]);
    expect(result.resources.get('aws-ec2-instances')).toEqual([
      {
        instanceType: 'c6i.large',
        location: {
          path: 'template.yaml',
          line: 8,
          column: 7,
        },
        resourceId: 'AppServer',
      },
    ]);
  });

  it('loads RDS instance datasets for Terraform and CloudFormation resources', async () => {
    mockedParseIaC.mockResolvedValue([
      createIaCResource({
        type: 'aws_db_instance',
        name: 'legacy',
        attributeLocations: {
          instance_class: {
            path: 'main.tf',
            line: 5,
            column: 3,
          },
        },
        attributes: {
          instance_class: 'db.m6i.large',
        },
      }),
      createIaCResource({
        type: 'AWS::RDS::DBInstance',
        name: 'Database',
        attributeLocations: {
          'Properties.DBInstanceClass': {
            path: 'template.yaml',
            line: 9,
            column: 7,
          },
        },
        attributes: {
          Properties: {
            DBInstanceClass: 'db.r7g.large',
          },
        },
      }),
    ]);

    const result = await loadAwsStaticResources('/tmp/iac', [
      createRule({
        staticDependencies: ['aws-rds-instances'],
      }),
    ]);

    expect(mockedParseIaC).toHaveBeenCalledWith('/tmp/iac', {
      sourceKinds: ['cloudformation', 'terraform'],
    });
    expect(result.resources.get('aws-rds-instances')).toEqual([
      {
        instanceClass: 'db.m6i.large',
        location: {
          path: 'main.tf',
          line: 5,
          column: 3,
        },
        resourceId: 'aws_db_instance.legacy',
      },
      {
        instanceClass: 'db.r7g.large',
        location: {
          path: 'template.yaml',
          line: 9,
          column: 7,
        },
        resourceId: 'Database',
      },
    ]);
  });

  it('loads ECR repository datasets for Terraform lifecycle resources and CloudFormation inline policies', async () => {
    mockedParseIaC.mockResolvedValue([
      createIaCResource({
        type: 'aws_ecr_repository',
        name: 'app',
        location: {
          path: 'main.tf',
          line: 1,
          column: 1,
        },
        attributes: {
          name: 'app',
        },
      }),
      createIaCResource({
        type: 'aws_ecr_lifecycle_policy',
        name: 'app',
        attributes: {
          repository: 'aws_ecr_repository.app.name',
        },
      }),
      createIaCResource({
        type: 'AWS::ECR::Repository',
        name: 'LogsRepository',
        location: {
          path: 'template.yaml',
          line: 10,
          column: 5,
        },
        attributes: {
          Properties: {
            LifecyclePolicy: {
              LifecyclePolicyText: '{"rules":[]}',
            },
            RepositoryName: 'logs',
          },
        },
      }),
      createIaCResource({
        type: 'AWS::ECR::Repository',
        name: 'MissingLifecycleRepository',
        location: {
          path: 'template.yaml',
          line: 18,
          column: 5,
        },
        attributes: {
          Properties: {
            RepositoryName: 'missing',
          },
        },
      }),
    ]);

    const result = await loadAwsStaticResources('/tmp/iac', [
      createRule({
        staticDependencies: ['aws-ecr-repositories'],
      }),
    ]);

    expect(result.resources.get('aws-ecr-repositories')).toEqual([
      {
        hasLifecyclePolicy: true,
        location: {
          path: 'main.tf',
          line: 1,
          column: 1,
        },
        resourceId: 'aws_ecr_repository.app',
      },
      {
        hasLifecyclePolicy: true,
        location: {
          path: 'template.yaml',
          line: 10,
          column: 5,
        },
        resourceId: 'LogsRepository',
      },
      {
        hasLifecyclePolicy: false,
        location: {
          path: 'template.yaml',
          line: 18,
          column: 5,
        },
        resourceId: 'MissingLifecycleRepository',
      },
    ]);
  });

  it('matches Terraform ECR lifecycle policies that reference repository ids', async () => {
    mockedParseIaC.mockResolvedValue([
      createIaCResource({
        type: 'aws_ecr_repository',
        name: 'app',
        location: {
          path: 'main.tf',
          line: 1,
          column: 1,
        },
        attributes: {
          name: 'app',
        },
      }),
      createIaCResource({
        type: 'aws_ecr_lifecycle_policy',
        name: 'app',
        attributes: {
          repository: 'aws_ecr_repository.app.id',
        },
      }),
    ]);

    const result = await loadAwsStaticResources('/tmp/iac', [
      createRule({
        staticDependencies: ['aws-ecr-repositories'],
      }),
    ]);

    expect(result.resources.get('aws-ecr-repositories')).toEqual([
      {
        hasLifecyclePolicy: true,
        location: {
          path: 'main.tf',
          line: 1,
          column: 1,
        },
        resourceId: 'aws_ecr_repository.app',
      },
    ]);
  });

  it('matches Terraform ECR lifecycle policies that share unresolved repository expressions', async () => {
    mockedParseIaC.mockResolvedValue([
      createIaCResource({
        type: 'aws_ecr_repository',
        name: 'app',
        location: {
          path: 'main.tf',
          line: 1,
          column: 1,
        },
        attributes: {
          name: '$' + '{var.repo_name}',
        },
      }),
      createIaCResource({
        type: 'aws_ecr_lifecycle_policy',
        name: 'app',
        attributes: {
          repository: '$' + '{var.repo_name}',
        },
      }),
    ]);

    const result = await loadAwsStaticResources('/tmp/iac', [
      createRule({
        staticDependencies: ['aws-ecr-repositories'],
      }),
    ]);

    expect(result.resources.get('aws-ecr-repositories')).toEqual([
      {
        hasLifecyclePolicy: true,
        location: {
          path: 'main.tf',
          line: 1,
          column: 1,
        },
        resourceId: 'aws_ecr_repository.app',
      },
    ]);
  });

  it('returns an empty bag without parsing when no static rules require datasets', async () => {
    const result = await loadAwsStaticResources('/tmp/iac', [
      createRule({
        evaluateStatic: undefined,
      }),
    ]);

    expect(mockedParseIaC).not.toHaveBeenCalled();
    expect(result.resources).toBeInstanceOf(StaticResourceBag);
    expect(result.resources.get('aws-ebs-volumes')).toEqual([]);
    expect(result.resources.get('aws-s3-bucket-analyses')).toEqual([]);
  });

  it('fails fast when a static rule has an evaluator but no staticDependencies metadata', async () => {
    await expect(
      loadAwsStaticResources('/tmp/iac', [
        createRule({
          staticDependencies: undefined,
        }),
      ]),
    ).rejects.toThrow('Static rule CLDBRN-AWS-TEST-1 is missing staticDependencies metadata.');

    expect(mockedParseIaC).not.toHaveBeenCalled();
  });

  it('fails fast when a static rule declares an unknown static dependency', async () => {
    await expect(
      loadAwsStaticResources('/tmp/iac', [
        createRule({
          staticDependencies: ['aws-missing-dataset' as Rule['staticDependencies'][number]],
        }),
      ]),
    ).rejects.toThrow("Static rule CLDBRN-AWS-TEST-1 declares unknown static dependency 'aws-missing-dataset'.");

    expect(mockedParseIaC).not.toHaveBeenCalled();
  });

  it('treats prototype keys as unknown static dependencies', async () => {
    await expect(
      loadAwsStaticResources('/tmp/iac', [
        createRule({
          staticDependencies: ['__proto__' as Rule['staticDependencies'][number]],
        }),
      ]),
    ).rejects.toThrow("Static rule CLDBRN-AWS-TEST-1 declares unknown static dependency '__proto__'.");

    expect(mockedParseIaC).not.toHaveBeenCalled();
  });
});

describe('aws static dataset registry', () => {
  it('normalizes EBS volume resources for Terraform and CloudFormation', () => {
    const definition = getAwsStaticDatasetDefinition('aws-ebs-volumes');

    expect(
      definition?.load([
        createIaCResource({
          type: 'aws_ebs_volume',
          name: 'logs',
          attributeLocations: {
            type: {
              path: 'main.tf',
              line: 4,
              column: 3,
            },
          },
          attributes: {
            type: 'gp2',
          },
        }),
        createIaCResource({
          type: 'AWS::EC2::Volume',
          name: 'DataVolume',
          attributeLocations: {
            'Properties.VolumeType': {
              path: 'template.yaml',
              line: 10,
              column: 7,
            },
          },
          attributes: {
            Properties: {
              VolumeType: 'gp3',
            },
          },
        }),
      ]),
    ).toEqual([
      {
        location: {
          path: 'main.tf',
          line: 4,
          column: 3,
        },
        resourceId: 'aws_ebs_volume.logs',
        volumeType: 'gp2',
      },
      {
        location: {
          path: 'template.yaml',
          line: 10,
          column: 7,
        },
        resourceId: 'DataVolume',
        volumeType: 'gp3',
      },
    ]);
  });

  it('normalizes ECR repositories for Terraform and CloudFormation', () => {
    const definition = getAwsStaticDatasetDefinition('aws-ecr-repositories');

    expect(
      definition?.load([
        createIaCResource({
          type: 'aws_ecr_repository',
          name: 'app',
          location: {
            path: 'main.tf',
            line: 2,
            column: 1,
          },
          attributes: {
            name: 'app',
          },
        }),
        createIaCResource({
          type: 'aws_ecr_lifecycle_policy',
          name: 'app',
          attributes: {
            repository: '$' + '{aws_ecr_repository.app.name}',
          },
        }),
        createIaCResource({
          type: 'AWS::ECR::Repository',
          name: 'LogsRepository',
          location: {
            path: 'template.yaml',
            line: 7,
            column: 3,
          },
          attributes: {
            Properties: {
              LifecyclePolicy: {
                LifecyclePolicyText: '{"rules":[]}',
              },
              RepositoryName: 'logs',
            },
          },
        }),
      ]),
    ).toEqual([
      {
        hasLifecyclePolicy: true,
        location: {
          path: 'main.tf',
          line: 2,
          column: 1,
        },
        resourceId: 'aws_ecr_repository.app',
      },
      {
        hasLifecyclePolicy: true,
        location: {
          path: 'template.yaml',
          line: 7,
          column: 3,
        },
        resourceId: 'LogsRepository',
      },
    ]);
  });

  it('normalizes EC2 instances and preserves null for unresolved static types', () => {
    const definition = getAwsStaticDatasetDefinition('aws-ec2-instances');

    expect(
      definition?.load([
        createIaCResource({
          type: 'aws_instance',
          name: 'legacy',
          attributeLocations: {
            instance_type: {
              path: 'main.tf',
              line: 3,
              column: 3,
            },
          },
          attributes: {
            instance_type: '${' + 'var.instance_type}',
          },
        }),
      ]),
    ).toEqual([
      {
        instanceType: null,
        location: {
          path: 'main.tf',
          line: 3,
          column: 3,
        },
        resourceId: 'aws_instance.legacy',
      },
    ]);
  });

  it('normalizes Lambda architectures and applies the AWS default for missing values', () => {
    const definition = getAwsStaticDatasetDefinition('aws-lambda-functions');

    expect(
      definition?.load([
        createIaCResource({
          type: 'aws_lambda_function',
          name: 'worker',
          attributeLocations: {
            architectures: {
              path: 'main.tf',
              line: 6,
              column: 3,
            },
          },
          attributes: {},
        }),
        createIaCResource({
          type: 'AWS::Lambda::Function',
          name: 'Fn',
          attributeLocations: {
            'Properties.Architectures': {
              path: 'template.yaml',
              line: 12,
              column: 7,
            },
          },
          attributes: {
            Properties: {
              Architectures: { Ref: 'ArchitectureList' },
            },
          },
        }),
      ]),
    ).toEqual([
      {
        architectures: ['x86_64'],
        location: {
          path: 'main.tf',
          line: 6,
          column: 3,
        },
        resourceId: 'aws_lambda_function.worker',
      },
      {
        architectures: null,
        location: {
          path: 'template.yaml',
          line: 12,
          column: 7,
        },
        resourceId: 'Fn',
      },
    ]);
  });

  it('normalizes RDS instances and preserves null for unresolved instance classes', () => {
    const definition = getAwsStaticDatasetDefinition('aws-rds-instances');

    expect(
      definition?.load([
        createIaCResource({
          type: 'aws_db_instance',
          name: 'legacy',
          attributeLocations: {
            instance_class: {
              path: 'main.tf',
              line: 4,
              column: 3,
            },
          },
          attributes: {
            instance_class: 'db.m6i.large',
          },
        }),
        createIaCResource({
          type: 'AWS::RDS::DBInstance',
          name: 'Database',
          attributeLocations: {
            'Properties.DBInstanceClass': {
              path: 'template.yaml',
              line: 11,
              column: 7,
            },
          },
          attributes: {
            Properties: {
              DBInstanceClass: {
                Ref: 'InstanceClass',
              },
            },
          },
        }),
      ]),
    ).toEqual([
      {
        instanceClass: 'db.m6i.large',
        location: {
          path: 'main.tf',
          line: 4,
          column: 3,
        },
        resourceId: 'aws_db_instance.legacy',
      },
      {
        instanceClass: null,
        location: {
          path: 'template.yaml',
          line: 11,
          column: 7,
        },
        resourceId: 'Database',
      },
    ]);
  });

  it('normalizes VPC endpoints with preselected source locations', () => {
    const definition = getAwsStaticDatasetDefinition('aws-ec2-vpc-endpoints');

    expect(
      definition?.load([
        createIaCResource({
          type: 'AWS::EC2::VPCEndpoint',
          name: 'S3Endpoint',
          attributeLocations: {
            'Properties.ServiceName': {
              path: 'template.yaml',
              line: 7,
              column: 7,
            },
            'Properties.VpcEndpointType': {
              path: 'template.yaml',
              line: 8,
              column: 7,
            },
          },
          attributes: {
            Properties: {
              ServiceName: 'com.amazonaws.us-east-1.s3',
              VpcEndpointType: 'Interface',
            },
          },
        }),
      ]),
    ).toEqual([
      {
        location: {
          path: 'template.yaml',
          line: 8,
          column: 7,
        },
        resourceId: 'S3Endpoint',
        serviceName: 'com.amazonaws.us-east-1.s3',
        vpcEndpointType: 'interface',
      },
    ]);
  });

  it('builds S3 bucket analyses from correlated Terraform lifecycle resources', () => {
    const definition = getAwsStaticDatasetDefinition('aws-s3-bucket-analyses');

    expect(
      definition?.load([
        createIaCResource({
          type: 'aws_s3_bucket',
          name: 'logs',
          location: {
            path: 'main.tf',
            line: 1,
            column: 1,
          },
          attributes: {
            bucket: 'example-logs',
          },
        }),
        createIaCResource({
          type: 'aws_s3_bucket_lifecycle_configuration',
          name: 'logs',
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
        }),
      ]),
    ).toEqual([
      {
        hasAbortIncompleteMultipartUploadAfter7Days: false,
        hasAlternativeStorageClassTransition: false,
        hasCostFocusedLifecycle: true,
        hasIntelligentTieringConfiguration: false,
        hasIntelligentTieringTransition: true,
        hasLifecycleSignal: true,
        hasUnclassifiedTransition: false,
        location: {
          path: 'main.tf',
          line: 1,
          column: 1,
        },
        resourceId: 'aws_s3_bucket.logs',
      },
    ]);
  });

  it('treats Terraform computed lifecycle storage classes as unclassified transitions', () => {
    const definition = getAwsStaticDatasetDefinition('aws-s3-bucket-analyses');

    expect(
      definition?.load([
        createIaCResource({
          type: 'aws_s3_bucket',
          name: 'logs',
          location: {
            path: 'main.tf',
            line: 1,
            column: 1,
          },
          attributes: {
            bucket: 'example-logs',
          },
        }),
        createIaCResource({
          type: 'aws_s3_bucket_lifecycle_configuration',
          name: 'logs',
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
      ]),
    ).toEqual([
      {
        hasAbortIncompleteMultipartUploadAfter7Days: false,
        hasAlternativeStorageClassTransition: false,
        hasCostFocusedLifecycle: true,
        hasIntelligentTieringConfiguration: false,
        hasIntelligentTieringTransition: false,
        hasLifecycleSignal: true,
        hasUnclassifiedTransition: true,
        location: {
          path: 'main.tf',
          line: 1,
          column: 1,
        },
        resourceId: 'aws_s3_bucket.logs',
      },
    ]);
  });

  it('treats CloudFormation intrinsic storage classes as unclassified transitions', () => {
    const definition = getAwsStaticDatasetDefinition('aws-s3-bucket-analyses');

    expect(
      definition?.load([
        createIaCResource({
          type: 'AWS::S3::Bucket',
          name: 'LogsBucket',
          location: {
            path: 'template.yaml',
            line: 3,
            column: 3,
          },
          attributes: {
            Properties: {
              LifecycleConfiguration: {
                Rules: [
                  {
                    Status: 'Enabled',
                    Transitions: [
                      {
                        StorageClass: {
                          Ref: 'ArchiveClass',
                        },
                      },
                    ],
                  },
                ],
              },
            },
          },
        }),
      ]),
    ).toEqual([
      {
        hasAbortIncompleteMultipartUploadAfter7Days: false,
        hasAlternativeStorageClassTransition: false,
        hasCostFocusedLifecycle: true,
        hasIntelligentTieringConfiguration: false,
        hasIntelligentTieringTransition: false,
        hasLifecycleSignal: true,
        hasUnclassifiedTransition: true,
        location: {
          path: 'template.yaml',
          line: 3,
          column: 3,
        },
        resourceId: 'LogsBucket',
      },
    ]);
  });

  it('builds S3 bucket analyses with abort-incomplete-multipart rules from Terraform lifecycle resources', () => {
    const definition = getAwsStaticDatasetDefinition('aws-s3-bucket-analyses');

    expect(
      definition?.load([
        createIaCResource({
          type: 'aws_s3_bucket',
          name: 'logs',
          location: {
            path: 'main.tf',
            line: 1,
            column: 1,
          },
          attributes: {
            bucket: 'example-logs',
          },
        }),
        createIaCResource({
          type: 'aws_s3_bucket_lifecycle_configuration',
          name: 'logs',
          attributes: {
            bucket: '${' + 'aws_s3_bucket.logs.id}',
            rule: [
              {
                abort_incomplete_multipart_upload: [
                  {
                    days_after_initiation: 7,
                  },
                ],
                id: 'abort-multipart',
                status: 'Enabled',
              },
            ],
          },
        }),
      ]),
    ).toEqual([
      {
        hasAbortIncompleteMultipartUploadAfter7Days: true,
        hasAlternativeStorageClassTransition: false,
        hasCostFocusedLifecycle: false,
        hasIntelligentTieringConfiguration: false,
        hasIntelligentTieringTransition: false,
        hasLifecycleSignal: true,
        hasUnclassifiedTransition: false,
        location: {
          path: 'main.tf',
          line: 1,
          column: 1,
        },
        resourceId: 'aws_s3_bucket.logs',
      },
    ]);
  });

  it('builds S3 bucket analyses with abort-incomplete-multipart rules from CloudFormation buckets', () => {
    const definition = getAwsStaticDatasetDefinition('aws-s3-bucket-analyses');

    expect(
      definition?.load([
        createIaCResource({
          type: 'AWS::S3::Bucket',
          name: 'LogsBucket',
          location: {
            path: 'template.yaml',
            line: 3,
            column: 3,
          },
          attributes: {
            Properties: {
              LifecycleConfiguration: {
                Rules: [
                  {
                    AbortIncompleteMultipartUpload: {
                      DaysAfterInitiation: 7,
                    },
                    Status: 'Enabled',
                  },
                ],
              },
            },
          },
        }),
      ]),
    ).toEqual([
      {
        hasAbortIncompleteMultipartUploadAfter7Days: true,
        hasAlternativeStorageClassTransition: false,
        hasCostFocusedLifecycle: false,
        hasIntelligentTieringConfiguration: false,
        hasIntelligentTieringTransition: false,
        hasLifecycleSignal: true,
        hasUnclassifiedTransition: false,
        location: {
          path: 'template.yaml',
          line: 3,
          column: 3,
        },
        resourceId: 'LogsBucket',
      },
    ]);
  });
});
