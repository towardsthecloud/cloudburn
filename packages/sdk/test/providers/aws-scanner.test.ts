import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAwsRegions } from '../../src/providers/aws/client.js';
import { discoverAwsEbsVolumes } from '../../src/providers/aws/resources/ebs.js';
import { scanAwsResources } from '../../src/providers/aws/scanner.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  resolveAwsRegions: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/ebs.js', () => ({
  discoverAwsEbsVolumes: vi.fn(),
}));

const mockedResolveAwsRegions = vi.mocked(resolveAwsRegions);
const mockedDiscoverAwsEbsVolumes = vi.mocked(discoverAwsEbsVolumes);

describe('scanAwsResources', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('resolves configured regions before discovering ebs volumes', async () => {
    mockedResolveAwsRegions.mockResolvedValue(['us-east-1', 'us-west-2']);
    mockedDiscoverAwsEbsVolumes.mockResolvedValue([{ volumeId: 'vol-123', volumeType: 'gp2', region: 'us-east-1' }]);

    const result = await scanAwsResources(['us-east-1']);

    expect(mockedResolveAwsRegions).toHaveBeenCalledWith(['us-east-1']);
    expect(mockedDiscoverAwsEbsVolumes).toHaveBeenCalledWith(['us-east-1', 'us-west-2']);
    expect(result).toEqual({
      ebsVolumes: [{ volumeId: 'vol-123', volumeType: 'gp2', region: 'us-east-1' }],
    });
  });
});
