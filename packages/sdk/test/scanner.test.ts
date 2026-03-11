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
          { volumeId: 'vol-123', volumeType: 'gp2', region: 'us-east-1', accountId: '123456789012' },
          { volumeId: 'vol-456', volumeType: 'gp3', region: 'us-east-1', accountId: '123456789012' },
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
                    startLine: 14,
                    startColumn: 3,
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
                    startLine: 4,
                    startColumn: 3,
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
                    startLine: 4,
                    startColumn: 3,
                  },
                },
                {
                  resourceId: 'MyVolume',
                  location: {
                    path: 'template.yaml',
                    startLine: 7,
                    startColumn: 7,
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
});
