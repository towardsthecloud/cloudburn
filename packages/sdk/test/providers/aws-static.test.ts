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
        iops: null,
        location: {
          path: 'main.tf',
          line: 4,
          column: 3,
        },
        resourceId: 'aws_ebs_volume.logs',
        sizeGiB: null,
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
        engine: null,
        engineVersion: null,
        instanceClass: 'db.m6i.large',
        location: {
          path: 'main.tf',
          line: 5,
          column: 3,
        },
        resourceId: 'aws_db_instance.legacy',
      },
      {
        engine: null,
        engineVersion: null,
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

  it('loads EBS volume size and IOPS for Terraform and CloudFormation resources', async () => {
    mockedParseIaC.mockResolvedValue([
      createIaCResource({
        type: 'aws_ebs_volume',
        name: 'logs',
        attributeLocations: {
          size: {
            path: 'main.tf',
            line: 5,
            column: 3,
          },
          iops: {
            path: 'main.tf',
            line: 6,
            column: 3,
          },
          type: {
            path: 'main.tf',
            line: 4,
            column: 3,
          },
        },
        attributes: {
          type: 'io2',
          size: 200,
          iops: 40000,
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
          'Properties.Size': {
            path: 'template.yaml',
            line: 11,
            column: 7,
          },
          'Properties.Iops': {
            path: 'template.yaml',
            line: 12,
            column: 7,
          },
        },
        attributes: {
          Properties: {
            VolumeType: 'io1',
            Size: 500,
            Iops: 16000,
          },
        },
      }),
    ]);

    const result = await loadAwsStaticResources('/tmp/iac', [
      createRule({
        staticDependencies: ['aws-ebs-volumes'],
      }),
    ]);

    expect(result.resources.get('aws-ebs-volumes')).toEqual([
      {
        iops: 40000,
        location: {
          path: 'main.tf',
          line: 4,
          column: 3,
        },
        resourceId: 'aws_ebs_volume.logs',
        sizeGiB: 200,
        volumeType: 'io2',
      },
      {
        iops: 16000,
        location: {
          path: 'template.yaml',
          line: 10,
          column: 7,
        },
        resourceId: 'DataVolume',
        sizeGiB: 500,
        volumeType: 'io1',
      },
    ]);
  });

  it('loads RDS engine metadata for Terraform and CloudFormation resources', async () => {
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
          engine: {
            path: 'main.tf',
            line: 6,
            column: 3,
          },
          engine_version: {
            path: 'main.tf',
            line: 7,
            column: 3,
          },
        },
        attributes: {
          instance_class: 'db.m6i.large',
          engine: 'mysql',
          engine_version: '5.7.44',
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
          'Properties.Engine': {
            path: 'template.yaml',
            line: 10,
            column: 7,
          },
          'Properties.EngineVersion': {
            path: 'template.yaml',
            line: 11,
            column: 7,
          },
        },
        attributes: {
          Properties: {
            DBInstanceClass: 'db.r7g.large',
            Engine: 'postgres',
            EngineVersion: '11.22',
          },
        },
      }),
    ]);

    const result = await loadAwsStaticResources('/tmp/iac', [
      createRule({
        staticDependencies: ['aws-rds-instances'],
      }),
    ]);

    expect(result.resources.get('aws-rds-instances')).toEqual([
      {
        engine: 'mysql',
        engineVersion: '5.7.44',
        instanceClass: 'db.m6i.large',
        location: {
          path: 'main.tf',
          line: 5,
          column: 3,
        },
        resourceId: 'aws_db_instance.legacy',
      },
      {
        engine: 'postgres',
        engineVersion: '11.22',
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

  it('loads API Gateway stages for Terraform and CloudFormation resources', async () => {
    mockedParseIaC.mockResolvedValue([
      createIaCResource({
        type: 'aws_api_gateway_stage',
        name: 'prod',
        attributeLocations: {
          cache_cluster_enabled: {
            path: 'main.tf',
            line: 6,
            column: 3,
          },
        },
        attributes: {
          rest_api_id: 'a1b2c3d4',
          stage_name: 'prod',
          cache_cluster_enabled: false,
        },
      }),
      createIaCResource({
        type: 'AWS::ApiGateway::Stage',
        name: 'ProdStage',
        attributeLocations: {
          'Properties.CacheClusterEnabled': {
            path: 'template.yaml',
            line: 9,
            column: 7,
          },
        },
        attributes: {
          Properties: {
            StageName: 'prod',
            RestApiId: 'a1b2c3d4',
            CacheClusterEnabled: true,
          },
        },
      }),
    ]);

    const result = await loadAwsStaticResources('/tmp/iac', [
      createRule({
        staticDependencies: ['aws-apigateway-stages'],
      }),
    ]);

    expect(result.resources.get('aws-apigateway-stages')).toEqual([
      {
        cacheClusterEnabled: false,
        location: {
          path: 'main.tf',
          line: 6,
          column: 3,
        },
        resourceId: 'aws_api_gateway_stage.prod',
      },
      {
        cacheClusterEnabled: true,
        location: {
          path: 'template.yaml',
          line: 9,
          column: 7,
        },
        resourceId: 'ProdStage',
      },
    ]);
  });

  it('loads CloudFront distributions and applies the default price class when omitted', async () => {
    mockedParseIaC.mockResolvedValue([
      createIaCResource({
        type: 'aws_cloudfront_distribution',
        name: 'cdn',
        location: {
          path: 'main.tf',
          line: 1,
          column: 1,
        },
        attributes: {
          enabled: true,
        },
      }),
      createIaCResource({
        type: 'AWS::CloudFront::Distribution',
        name: 'NarrowDistribution',
        attributeLocations: {
          'Properties.DistributionConfig.PriceClass': {
            path: 'template.yaml',
            line: 8,
            column: 9,
          },
        },
        attributes: {
          Properties: {
            DistributionConfig: {
              PriceClass: 'PriceClass_100',
            },
          },
        },
      }),
    ]);

    const result = await loadAwsStaticResources('/tmp/iac', [
      createRule({
        staticDependencies: ['aws-cloudfront-distributions'],
      }),
    ]);

    expect(result.resources.get('aws-cloudfront-distributions')).toEqual([
      {
        location: {
          path: 'main.tf',
          line: 1,
          column: 1,
        },
        priceClass: 'PriceClass_All',
        resourceId: 'aws_cloudfront_distribution.cdn',
      },
      {
        location: {
          path: 'template.yaml',
          line: 8,
          column: 9,
        },
        priceClass: 'PriceClass_100',
        resourceId: 'NarrowDistribution',
      },
    ]);
  });

  it('loads CloudWatch log groups and preserves unresolved retention values as null', async () => {
    mockedParseIaC.mockResolvedValue([
      createIaCResource({
        type: 'aws_cloudwatch_log_group',
        name: 'app',
        attributeLocations: {
          retention_in_days: {
            path: 'main.tf',
            line: 4,
            column: 3,
          },
          log_group_class: {
            path: 'main.tf',
            line: 5,
            column: 3,
          },
        },
        attributes: {
          name: '/aws/lambda/app',
          retention_in_days: 30,
          log_group_class: 'DELIVERY',
        },
      }),
      createIaCResource({
        type: 'AWS::Logs::LogGroup',
        name: 'MissingRetentionGroup',
        location: {
          path: 'template.yaml',
          line: 3,
          column: 3,
        },
        attributes: {
          Properties: {},
        },
      }),
      createIaCResource({
        type: 'AWS::Logs::LogGroup',
        name: 'RefRetentionGroup',
        attributeLocations: {
          'Properties.RetentionInDays': {
            path: 'template.yaml',
            line: 10,
            column: 7,
          },
        },
        attributes: {
          Properties: {
            RetentionInDays: {
              Ref: 'RetentionDays',
            },
          },
        },
      }),
    ]);

    const result = await loadAwsStaticResources('/tmp/iac', [
      createRule({
        staticDependencies: ['aws-cloudwatch-log-groups'],
      }),
    ]);

    expect(result.resources.get('aws-cloudwatch-log-groups')).toEqual([
      {
        location: {
          path: 'main.tf',
          line: 4,
          column: 3,
        },
        logGroupClass: 'DELIVERY',
        resourceId: 'aws_cloudwatch_log_group.app',
        retentionInDays: 30,
      },
      {
        location: {
          path: 'template.yaml',
          line: 3,
          column: 3,
        },
        logGroupClass: undefined,
        resourceId: 'MissingRetentionGroup',
        retentionInDays: undefined,
      },
      {
        location: {
          path: 'template.yaml',
          line: 10,
          column: 7,
        },
        logGroupClass: undefined,
        resourceId: 'RefRetentionGroup',
        retentionInDays: null,
      },
    ]);
  });

  it('loads DynamoDB tables and table-level autoscaling state', async () => {
    mockedParseIaC.mockResolvedValue([
      createIaCResource({
        type: 'aws_dynamodb_table',
        name: 'orders',
        attributeLocations: {
          name: {
            path: 'main.tf',
            line: 2,
            column: 3,
          },
        },
        attributes: {
          name: 'orders',
        },
      }),
      createIaCResource({
        type: 'aws_appautoscaling_target',
        name: 'orders_read',
        attributes: {
          resource_id: 'table/orders',
          scalable_dimension: 'dynamodb:table:ReadCapacityUnits',
        },
      }),
      createIaCResource({
        type: 'aws_appautoscaling_target',
        name: 'orders_write',
        attributes: {
          resource_id: 'table/orders',
          scalable_dimension: 'dynamodb:table:WriteCapacityUnits',
        },
      }),
      createIaCResource({
        type: 'AWS::DynamoDB::Table',
        name: 'ProvisionedTable',
        location: {
          path: 'template.yaml',
          line: 3,
          column: 3,
        },
        attributes: {
          Properties: {},
        },
      }),
    ]);

    const result = await loadAwsStaticResources('/tmp/iac', [
      createRule({
        staticDependencies: ['aws-dynamodb-tables', 'aws-dynamodb-autoscaling'],
      }),
    ]);

    expect(result.resources.get('aws-dynamodb-tables')).toEqual([
      {
        billingMode: 'PROVISIONED',
        location: {
          path: 'main.tf',
          line: 2,
          column: 3,
        },
        resourceId: 'aws_dynamodb_table.orders',
        tableName: 'orders',
      },
      {
        billingMode: 'PROVISIONED',
        location: {
          path: 'template.yaml',
          line: 3,
          column: 3,
        },
        resourceId: 'ProvisionedTable',
        tableName: 'ProvisionedTable',
      },
    ]);
    expect(result.resources.get('aws-dynamodb-autoscaling')).toEqual([
      {
        hasReadTarget: true,
        hasWriteTarget: true,
        tableName: 'orders',
      },
    ]);
  });

  it('loads Elastic IP association state from inline and separate resources', async () => {
    mockedParseIaC.mockResolvedValue([
      createIaCResource({
        type: 'aws_eip',
        name: 'inline',
        attributeLocations: {
          instance: {
            path: 'main.tf',
            line: 4,
            column: 3,
          },
        },
        attributes: {
          instance: 'i-1234567890',
        },
      }),
      createIaCResource({
        type: 'aws_eip',
        name: 'detached',
        location: {
          path: 'main.tf',
          line: 7,
          column: 1,
        },
        attributes: {},
      }),
      createIaCResource({
        type: 'aws_eip_association',
        name: 'detached_assoc',
        attributes: {
          allocation_id: 'aws_eip.detached.id',
          instance_id: 'i-abcdef1234',
        },
      }),
      createIaCResource({
        type: 'AWS::EC2::EIP',
        name: 'PublicAddress',
        location: {
          path: 'template.yaml',
          line: 3,
          column: 3,
        },
        attributes: {
          Properties: {},
        },
      }),
    ]);

    const result = await loadAwsStaticResources('/tmp/iac', [
      createRule({
        staticDependencies: ['aws-ec2-elastic-ips'],
      }),
    ]);

    expect(result.resources.get('aws-ec2-elastic-ips')).toEqual([
      {
        isAssociated: true,
        location: {
          path: 'main.tf',
          line: 4,
          column: 3,
        },
        resourceId: 'aws_eip.inline',
      },
      {
        isAssociated: true,
        location: {
          path: 'main.tf',
          line: 7,
          column: 1,
        },
        resourceId: 'aws_eip.detached',
      },
      {
        isAssociated: false,
        location: {
          path: 'template.yaml',
          line: 3,
          column: 3,
        },
        resourceId: 'PublicAddress',
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
        iops: null,
        location: {
          path: 'main.tf',
          line: 4,
          column: 3,
        },
        resourceId: 'aws_ebs_volume.logs',
        sizeGiB: null,
        volumeType: 'gp2',
      },
      {
        iops: null,
        location: {
          path: 'template.yaml',
          line: 10,
          column: 7,
        },
        resourceId: 'DataVolume',
        sizeGiB: null,
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
        engine: null,
        engineVersion: null,
        instanceClass: 'db.m6i.large',
        location: {
          path: 'main.tf',
          line: 4,
          column: 3,
        },
        resourceId: 'aws_db_instance.legacy',
      },
      {
        engine: null,
        engineVersion: null,
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
});
