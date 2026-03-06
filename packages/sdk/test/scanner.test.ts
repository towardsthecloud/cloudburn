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
        { volumeId: 'vol-123', volumeType: 'gp2', region: 'us-east-1' },
        { volumeId: 'vol-456', volumeType: 'gp3', region: 'us-east-1' },
      ],
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
      source: 'discovery',
      findings: [
        {
          id: 'CLDBRN-AWS-EBS-1:vol-123',
          ruleId: 'CLDBRN-AWS-EBS-1',
          message: 'EBS volume vol-123 uses gp2; migrate to gp3.',
          resource: {
            provider: 'aws',
            accountId: '',
            region: 'us-east-1',
            service: 'ebs',
            resourceId: 'vol-123',
          },
          source: 'discovery',
        },
      ],
    });
  });

  it('returns an empty static scan result when no static rules are implemented', async () => {
    const scanner = new CloudBurnScanner();

    const result = await scanner.scanStatic(process.cwd());

    expect(result.source).toBe('iac');
    expect(result.findings).toHaveLength(0);
  });
});
