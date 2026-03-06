import type { AwsEbsVolume } from '@cloudburn/rules';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { discoverAwsEbsVolumes } from '../src/providers/aws/resources/ebs.js';
import { CloudBurnScanner } from '../src/scanner.js';

vi.mock('../src/providers/aws/resources/ebs.js', () => ({
  discoverAwsEbsVolumes: vi.fn(),
}));

const mockedDiscoverAwsEbsVolumes = vi.mocked(discoverAwsEbsVolumes);

const createVolume = (overrides: Partial<AwsEbsVolume> = {}): AwsEbsVolume => ({
  volumeId: 'vol-123',
  volumeType: 'gp2',
  region: 'us-east-1',
  ...overrides,
});

describe('CloudBurnScanner', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns gp2 findings from live ebs discovery', async () => {
    mockedDiscoverAwsEbsVolumes.mockResolvedValue([
      createVolume(),
      createVolume({ volumeId: 'vol-456', volumeType: 'gp3' }),
    ]);

    const scanner = new CloudBurnScanner();

    const result = await scanner.scanLive();

    expect(result).toEqual({
      mode: 'live',
      findings: [
        {
          id: 'ebs-gp2-to-gp3:vol-123',
          ruleId: 'ebs-gp2-to-gp3',
          severity: 'warning',
          message: 'EBS volume vol-123 uses gp2; migrate to gp3.',
          location: 'aws://ebs/us-east-1/vol-123',
          mode: 'live',
        },
      ],
    });
  });

  it('returns an empty static scan result when no static rules are implemented', async () => {
    const scanner = new CloudBurnScanner();

    const result = await scanner.scanStatic(process.cwd());

    expect(result.mode).toBe('static');
    expect(result.findings).toHaveLength(0);
  });
});
