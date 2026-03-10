import type { DescribeVolumesCommand } from '@aws-sdk/client-ec2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEc2Client } from '../../src/providers/aws/client.js';
import { hydrateAwsEbsVolumes } from '../../src/providers/aws/resources/ebs.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createEc2Client: vi.fn(),
}));

const mockedCreateEc2Client = vi.mocked(createEc2Client);

describe('hydrateAwsEbsVolumes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates discovered EBS volumes by batching volume ids per region', async () => {
    mockedCreateEc2Client.mockImplementation(({ region }) => {
      const send = vi.fn(async (command: DescribeVolumesCommand) => {
        const input = command.input as { VolumeIds?: string[] };

        return {
          Volumes: (input.VolumeIds ?? []).map((volumeId) => ({
            VolumeId: volumeId,
            VolumeType: region === 'us-east-1' ? 'gp2' : 'gp3',
          })),
        };
      });

      return { send } as never;
    });

    const volumes = await hydrateAwsEbsVolumes([
      {
        accountId: '123456789012',
        arn: 'arn:aws:ec2:us-east-1:123456789012:volume/vol-123',
        properties: [],
        region: 'us-east-1',
        resourceType: 'ec2:volume',
        service: 'ec2',
      },
      {
        accountId: '123456789012',
        arn: 'arn:aws:ec2:us-west-2:123456789012:volume/vol-456',
        properties: [],
        region: 'us-west-2',
        resourceType: 'ec2:volume',
        service: 'ec2',
      },
    ]);

    expect(mockedCreateEc2Client).toHaveBeenCalledTimes(2);
    expect(volumes).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        volumeId: 'vol-123',
        volumeType: 'gp2',
      },
      {
        accountId: '123456789012',
        region: 'us-west-2',
        volumeId: 'vol-456',
        volumeType: 'gp3',
      },
    ]);
  });
});
