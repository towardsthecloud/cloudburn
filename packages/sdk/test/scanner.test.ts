import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scanAwsResources } from '../src/providers/aws/scanner.js';
import { CloudBurnScanner } from '../src/scanner.js';

vi.mock('../src/providers/aws/scanner.js', () => ({
  scanAwsResources: vi.fn(),
}));

const mockedScanAwsResources = vi.mocked(scanAwsResources);

describe('CloudBurnScanner', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('passes configured regions to the aws provider scanner and returns gp2 findings', async () => {
    mockedScanAwsResources.mockResolvedValue({
      ebsVolumes: [
        { volumeId: 'vol-123', volumeType: 'gp2', region: 'us-east-1', accountId: '123456789012' },
        { volumeId: 'vol-456', volumeType: 'gp3', region: 'us-east-1', accountId: '123456789012' },
      ],
      lambdaFunctions: [],
    });

    const scanner = new CloudBurnScanner();

    const result = await scanner.scanLive({
      live: {
        regions: ['us-east-1'],
        tags: {},
      },
    });

    expect(mockedScanAwsResources).toHaveBeenCalledWith(['us-east-1']);

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
    mockedScanAwsResources.mockResolvedValue({
      ebsVolumes: [],
      lambdaFunctions: [
        { functionName: 'legacy-func', architectures: ['x86_64'], region: 'us-east-1', accountId: '123456789012' },
        { functionName: 'arm-func', architectures: ['arm64'], region: 'us-east-1', accountId: '123456789012' },
      ],
    });

    const scanner = new CloudBurnScanner();

    const result = await scanner.scanLive({
      live: {
        regions: ['us-east-1'],
        tags: {},
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

  it('returns a static ebs finding from the generic terraform resource catalog', async () => {
    const scanner = new CloudBurnScanner();
    const fixturePath = fileURLToPath(new URL('./fixtures/terraform/scan-dir', import.meta.url));

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
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static ebs findings from terraform and cloudformation resources in the same directory', async () => {
    const scanner = new CloudBurnScanner();
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
    const scanner = new CloudBurnScanner();
    const fixturePath = fileURLToPath(new URL('./fixtures/terraform/no-resources', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [],
    });
  });
});
