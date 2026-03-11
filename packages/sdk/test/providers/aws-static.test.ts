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
            startLine: 4,
            startColumn: 3,
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
            startLine: 8,
            startColumn: 7,
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
          startLine: 4,
          startColumn: 3,
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
          startLine: 8,
          startColumn: 7,
        },
        resourceId: 'AppServer',
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
              startLine: 4,
              startColumn: 3,
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
              startLine: 10,
              startColumn: 7,
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
          startLine: 4,
          startColumn: 3,
        },
        resourceId: 'aws_ebs_volume.logs',
        volumeType: 'gp2',
      },
      {
        location: {
          path: 'template.yaml',
          startLine: 10,
          startColumn: 7,
        },
        resourceId: 'DataVolume',
        volumeType: 'gp3',
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
              startLine: 3,
              startColumn: 3,
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
          startLine: 3,
          startColumn: 3,
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
              startLine: 6,
              startColumn: 3,
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
              startLine: 12,
              startColumn: 7,
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
          startLine: 6,
          startColumn: 3,
        },
        resourceId: 'aws_lambda_function.worker',
      },
      {
        architectures: null,
        location: {
          path: 'template.yaml',
          startLine: 12,
          startColumn: 7,
        },
        resourceId: 'Fn',
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
              startLine: 7,
              startColumn: 7,
            },
            'Properties.VpcEndpointType': {
              path: 'template.yaml',
              startLine: 8,
              startColumn: 7,
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
          startLine: 8,
          startColumn: 7,
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
            startLine: 1,
            startColumn: 1,
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
        hasAlternativeStorageClassTransition: false,
        hasCostFocusedLifecycle: true,
        hasIntelligentTieringConfiguration: false,
        hasIntelligentTieringTransition: true,
        hasLifecycleSignal: true,
        hasUnclassifiedTransition: false,
        location: {
          path: 'main.tf',
          startLine: 1,
          startColumn: 1,
        },
        resourceId: 'aws_s3_bucket.logs',
      },
    ]);
  });
});
