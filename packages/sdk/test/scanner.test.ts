import { fileURLToPath } from 'node:url';
import { LiveResourceBag } from '@cloudburn/rules';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { discoverAwsResources } from '../src/providers/aws/discovery.js';
import { CloudBurnClient } from '../src/scanner.js';

vi.mock('../src/providers/aws/discovery.js', () => ({
  discoverAwsResources: vi.fn(),
}));

const mockedDiscoverAwsResources = vi.mocked(discoverAwsResources);

const discoveryCatalog = {
  resources: [],
  searchRegion: 'us-east-1',
  indexType: 'LOCAL' as const,
};

describe('CloudBurnClient', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('passes the explicit discovery target to the aws provider scanner and returns gp2 findings', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [
          {
            accountId: '123456789012',
            iops: 3000,
            region: 'us-east-1',
            sizeGiB: 64,
            volumeId: 'vol-123',
            volumeType: 'gp2',
          },
          {
            accountId: '123456789012',
            iops: 3000,
            region: 'us-east-1',
            sizeGiB: 64,
            volumeId: 'vol-456',
            volumeType: 'gp3',
          },
        ],
      }),
    });

    const scanner = new CloudBurnClient();

    const result = await scanner.discover({
      target: {
        mode: 'region',
        region: 'us-east-1',
      },
    });

    expect(mockedDiscoverAwsResources).toHaveBeenCalledWith(expect.any(Array), {
      mode: 'region',
      region: 'us-east-1',
    });

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-EBS-1',
              service: 'ebs',
              source: 'discovery',
              message: 'EBS volumes should use current-generation storage.',
              findings: [
                {
                  resourceId: 'vol-123',
                  region: 'us-east-1',
                  accountId: '123456789012',
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns lambda architecture findings discovered during live scans', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-lambda-functions': [
          { functionName: 'legacy-func', architectures: ['x86_64'], region: 'us-east-1', accountId: '123456789012' },
          { functionName: 'arm-func', architectures: ['arm64'], region: 'us-east-1', accountId: '123456789012' },
        ],
      }),
    });

    const scanner = new CloudBurnClient();

    const result = await scanner.discover({
      target: {
        mode: 'region',
        region: 'us-east-1',
      },
    });

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-LAMBDA-1',
              service: 'lambda',
              source: 'discovery',
              message: 'Lambda functions should use arm64 architecture when compatible to reduce running costs.',
              findings: [
                {
                  resourceId: 'legacy-func',
                  region: 'us-east-1',
                  accountId: '123456789012',
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns non-preferred EC2 instance findings discovered during live scans', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-ec2-instances': [
          {
            accountId: '123456789012',
            instanceId: 'i-legacy',
            instanceType: 'c6i.large',
            region: 'us-east-1',
          },
          {
            accountId: '123456789012',
            instanceId: 'i-current',
            instanceType: 'm8i.large',
            region: 'us-east-1',
          },
        ],
      }),
    });

    const scanner = new CloudBurnClient();

    const result = await scanner.discover({
      target: {
        mode: 'region',
        region: 'us-east-1',
      },
    });

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-EC2-1',
              service: 'ec2',
              source: 'discovery',
              message: 'EC2 instances should use preferred instance types.',
              findings: [
                {
                  resourceId: 'i-legacy',
                  region: 'us-east-1',
                  accountId: '123456789012',
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns non-preferred RDS DB instance findings discovered during live scans', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-rds-instances': [
          {
            accountId: '123456789012',
            dbInstanceIdentifier: 'legacy-db',
            instanceClass: 'db.m6i.large',
            region: 'us-east-1',
          },
          {
            accountId: '123456789012',
            dbInstanceIdentifier: 'current-db',
            instanceClass: 'db.r8g.large',
            region: 'us-east-1',
          },
        ],
      } as never),
    });

    const scanner = new CloudBurnClient();

    const result = await scanner.discover({
      target: {
        mode: 'region',
        region: 'us-east-1',
      },
    });

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-RDS-1',
              service: 'rds',
              source: 'discovery',
              message: 'RDS DB instances should use preferred instance classes.',
              findings: [
                {
                  resourceId: 'legacy-db',
                  region: 'us-east-1',
                  accountId: '123456789012',
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-RDS-4',
              service: 'rds',
              source: 'discovery',
              message: 'RDS DB instances without a Graviton equivalent in use should be reviewed.',
              findings: [
                {
                  resourceId: 'legacy-db',
                  region: 'us-east-1',
                  accountId: '123456789012',
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('defaults discover to the current region target when none is provided', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag(),
    });

    const scanner = new CloudBurnClient();

    await scanner.discover();

    expect(mockedDiscoverAwsResources).toHaveBeenCalledWith(expect.any(Array), {
      mode: 'current',
    });
  });

  it('passes an explicit config path through discovery config loading', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag(),
    });

    const scanner = new CloudBurnClient();
    const loadConfig = vi.spyOn(scanner, 'loadConfig').mockResolvedValue({
      discovery: {},
      iac: {},
    });

    await scanner.discover({ configPath: '/tmp/cloudburn.yml' });

    expect(loadConfig).toHaveBeenCalledWith('/tmp/cloudburn.yml');
  });

  it('returns a static ebs finding from the generic terraform resource catalog', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/terraform/scan-dir', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-EC2-1',
              service: 'ec2',
              source: 'iac',
              message: 'EC2 instances should use preferred instance types.',
              findings: [
                {
                  resourceId: 'aws_instance.web',
                  location: {
                    path: 'variables.tf',
                    line: 14,
                    column: 3,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-EC2-6',
              service: 'ec2',
              source: 'iac',
              message: 'EC2 instances without a Graviton equivalent in use should be reviewed.',
              findings: [
                {
                  resourceId: 'aws_instance.web',
                  location: {
                    path: 'variables.tf',
                    line: 14,
                    column: 3,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-EBS-1',
              service: 'ebs',
              source: 'iac',
              message: 'EBS volumes should use current-generation storage.',
              findings: [
                {
                  resourceId: 'aws_ebs_volume.gp2_logs',
                  location: {
                    path: 'main.tf',
                    line: 4,
                    column: 3,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-EBS-4',
              service: 'ebs',
              source: 'iac',
              message: 'EBS volumes larger than 100 GiB should be reviewed.',
              findings: [
                {
                  resourceId: 'aws_ebs_volume.gp3_data',
                  location: {
                    path: 'main.tf',
                    line: 10,
                    column: 3,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns a static EC2 finding from a CloudFormation template', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/cloudformation/ec2-instance.yaml', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-EC2-1',
              service: 'ec2',
              source: 'iac',
              message: 'EC2 instances should use preferred instance types.',
              findings: [
                {
                  resourceId: 'LegacyWeb',
                  location: {
                    path: 'ec2-instance.yaml',
                    line: 7,
                    column: 7,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static ebs findings from terraform and cloudformation resources in the same directory', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-mixed', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-EBS-1',
              service: 'ebs',
              source: 'iac',
              message: 'EBS volumes should use current-generation storage.',
              findings: [
                {
                  resourceId: 'aws_ebs_volume.gp2_logs',
                  location: {
                    path: 'main.tf',
                    line: 4,
                    column: 3,
                  },
                },
                {
                  resourceId: 'MyVolume',
                  location: {
                    path: 'template.yaml',
                    line: 7,
                    column: 7,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static RDS findings from Terraform DB instance resources', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/terraform/rds-scan-dir', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-RDS-1',
              service: 'rds',
              source: 'iac',
              message: 'RDS DB instances should use preferred instance classes.',
              findings: [
                {
                  resourceId: 'aws_db_instance.legacy',
                  location: {
                    path: 'main.tf',
                    line: 4,
                    column: 3,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-RDS-4',
              service: 'rds',
              source: 'iac',
              message: 'RDS DB instances without a Graviton equivalent in use should be reviewed.',
              findings: [
                {
                  resourceId: 'aws_db_instance.legacy',
                  location: {
                    path: 'main.tf',
                    line: 4,
                    column: 3,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static RDS findings from terraform and cloudformation resources in the same directory', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-rds-mixed', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-RDS-1',
              service: 'rds',
              source: 'iac',
              message: 'RDS DB instances should use preferred instance classes.',
              findings: [
                {
                  resourceId: 'aws_db_instance.legacy',
                  location: {
                    path: 'main.tf',
                    line: 4,
                    column: 3,
                  },
                },
                {
                  resourceId: 'LegacyDatabase',
                  location: {
                    path: 'template.yaml',
                    line: 7,
                    column: 7,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-RDS-4',
              service: 'rds',
              source: 'iac',
              message: 'RDS DB instances without a Graviton equivalent in use should be reviewed.',
              findings: [
                {
                  resourceId: 'aws_db_instance.legacy',
                  location: {
                    path: 'main.tf',
                    line: 4,
                    column: 3,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static EC2 endpoint findings from terraform and cloudformation resources in the same directory', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-ec2-endpoint-mixed', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-EC2-2',
              service: 'ec2',
              source: 'iac',
              message: 'S3 access inside a VPC should prefer gateway endpoints over interface endpoints when possible.',
              findings: [
                {
                  resourceId: 'aws_vpc_endpoint.s3_private_link',
                  location: {
                    path: 'main.tf',
                    line: 4,
                    column: 3,
                  },
                },
                {
                  resourceId: 'S3Endpoint',
                  location: {
                    path: 'template.yaml',
                    line: 7,
                    column: 7,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static Lambda findings from terraform and cloudformation resources in the same directory', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-lambda-mixed', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-LAMBDA-1',
              service: 'lambda',
              source: 'iac',
              message: 'Lambda functions should use arm64 architecture when compatible to reduce running costs.',
              findings: [
                {
                  resourceId: 'aws_lambda_function.legacy',
                  location: {
                    path: 'main.tf',
                    line: 7,
                    column: 3,
                  },
                },
                {
                  resourceId: 'LegacyFunction',
                  location: {
                    path: 'template.yaml',
                    line: 10,
                    column: 7,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static API Gateway, CloudFront, and CloudWatch findings from mixed IaC resources', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-config-mixed', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-APIGATEWAY-1',
              service: 'apigateway',
              source: 'iac',
              message: 'API Gateway REST API stages should enable caching when stage caching is available.',
              findings: [
                {
                  resourceId: 'aws_api_gateway_stage.prod',
                  location: {
                    path: 'main.tf',
                    line: 4,
                    column: 3,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-CLOUDFRONT-1',
              service: 'cloudfront',
              source: 'iac',
              message: 'CloudFront distributions using PriceClass_All should be reviewed for cheaper edge coverage.',
              findings: [
                {
                  resourceId: 'aws_cloudfront_distribution.cdn',
                  location: {
                    path: 'main.tf',
                    line: 7,
                    column: 1,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-CLOUDWATCH-1',
              service: 'cloudwatch',
              source: 'iac',
              message:
                'CloudWatch log groups should define a retention policy unless AWS manages lifecycle automatically.',
              findings: [
                {
                  resourceId: 'MissingRetentionGroup',
                  location: {
                    path: 'template.yaml',
                    line: 2,
                    column: 3,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static DynamoDB and Elastic IP findings from mixed IaC resources', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-capacity-mixed', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-DYNAMODB-2',
              service: 'dynamodb',
              source: 'iac',
              message: 'Provisioned-capacity DynamoDB tables should use auto-scaling.',
              findings: [
                {
                  resourceId: 'aws_dynamodb_table.logs',
                  location: {
                    path: 'main.tf',
                    line: 11,
                    column: 3,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-EC2-3',
              service: 'ec2',
              source: 'iac',
              message: 'Elastic IP addresses should not remain unassociated.',
              findings: [
                {
                  resourceId: 'PublicAddress',
                  location: {
                    path: 'template.yaml',
                    line: 2,
                    column: 3,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static EKS and EMR findings from mixed IaC resources', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-compute-mixed', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-EKS-1',
              service: 'eks',
              source: 'iac',
              message: 'EKS node groups without a Graviton equivalent in use should be reviewed.',
              findings: [
                {
                  resourceId: 'aws_eks_node_group.workers',
                  location: {
                    path: 'main.tf',
                    line: 4,
                    column: 3,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-EMR-1',
              service: 'emr',
              source: 'iac',
              message: 'EMR clusters using previous-generation instance types should be reviewed.',
              findings: [
                {
                  resourceId: 'LegacyAnalytics',
                  location: {
                    path: 'template.yaml',
                    line: 2,
                    column: 3,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static Route 53 findings from mixed IaC resources', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-route53-mixed', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-ROUTE53-1',
              service: 'route53',
              source: 'iac',
              message: 'Route 53 record sets should generally use TTL values of at least 3600 seconds.',
              findings: [
                {
                  resourceId: 'aws_route53_record.api',
                  location: {
                    path: 'main.tf',
                    line: 11,
                    column: 3,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-ROUTE53-2',
              service: 'route53',
              source: 'iac',
              message: 'Route 53 health checks not associated with any DNS record should be deleted.',
              findings: [
                {
                  resourceId: 'UnusedCheck',
                  location: {
                    path: 'template.yaml',
                    line: 2,
                    column: 3,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static S3 findings from terraform and cloudformation resources in the same directory', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-s3-mixed', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-S3-1',
              service: 's3',
              source: 'iac',
              message: 'S3 buckets should define lifecycle management policies.',
              findings: [
                {
                  resourceId: 'aws_s3_bucket.missing_lifecycle',
                  location: {
                    path: 'main.tf',
                    line: 1,
                    column: 1,
                  },
                },
                {
                  resourceId: 'MissingLifecycleBucket',
                  location: {
                    path: 'template.yaml',
                    line: 2,
                    column: 3,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-S3-2',
              service: 's3',
              source: 'iac',
              message:
                'S3 buckets with lifecycle management should match object access patterns to the right storage class.',
              findings: [
                {
                  resourceId: 'aws_s3_bucket.expire_only',
                  location: {
                    path: 'main.tf',
                    line: 5,
                    column: 1,
                  },
                },
                {
                  resourceId: 'ExpireOnlyBucket',
                  location: {
                    path: 'template.yaml',
                    line: 4,
                    column: 3,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns an empty static scan result when terraform files have no aws resources', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/terraform/no-resources', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [],
    });
  });

  it('passes an explicit config path through static scan config loading', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/terraform/no-resources', import.meta.url));
    const loadConfig = vi.spyOn(scanner, 'loadConfig').mockResolvedValue({
      discovery: {},
      iac: {},
    });

    await scanner.scanStatic(fixturePath, undefined, { configPath: '/tmp/cloudburn.yml' });

    expect(loadConfig).toHaveBeenCalledWith('/tmp/cloudburn.yml');
  });
});
