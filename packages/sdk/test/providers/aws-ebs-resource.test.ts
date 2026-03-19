import type { DescribeSnapshotsCommand, DescribeVolumesCommand } from '@aws-sdk/client-ec2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEc2Client } from '../../src/providers/aws/client.js';
import { hydrateAwsEbsSnapshots, hydrateAwsEbsVolumes } from '../../src/providers/aws/resources/ebs.js';

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
            Attachments: volumeId === 'vol-123' ? [] : [{ InstanceId: 'i-1234567890abcdef0' }],
            Iops: volumeId === 'vol-123' ? 3000 : 12000,
            Size: volumeId === 'vol-123' ? 64 : 256,
            State: volumeId === 'vol-123' ? 'available' : 'in-use',
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
        attachments: [],
        iops: 3000,
        region: 'us-east-1',
        sizeGiB: 64,
        state: 'available',
        volumeId: 'vol-123',
        volumeType: 'gp2',
      },
      {
        accountId: '123456789012',
        attachments: [{ instanceId: 'i-1234567890abcdef0' }],
        iops: 12000,
        region: 'us-west-2',
        sizeGiB: 256,
        state: 'in-use',
        volumeId: 'vol-456',
        volumeType: 'gp3',
      },
    ]);
  });

  it('preserves EC2 API context when volume hydration is throttled', async () => {
    mockedCreateEc2Client.mockReturnValue({
      send: vi.fn().mockRejectedValue(
        Object.assign(new Error('Rate exceeded'), {
          name: 'RequestLimitExceeded',
          $metadata: {
            httpStatusCode: 503,
            requestId: 'request-456',
          },
        }),
      ),
    } as never);

    await expect(
      hydrateAwsEbsVolumes([
        {
          accountId: '123456789012',
          arn: 'arn:aws:ec2:eu-central-1:123456789012:volume/vol-123',
          properties: [],
          region: 'eu-central-1',
          resourceType: 'ec2:volume',
          service: 'ec2',
        },
      ]),
    ).rejects.toThrow(
      'Amazon EC2 DescribeVolumes failed in eu-central-1 with RequestLimitExceeded: Rate exceeded Request ID: request-456.',
    );
  });

  it('preserves EC2 error identity when volume hydration is access denied', async () => {
    mockedCreateEc2Client.mockReturnValue({
      send: vi.fn().mockRejectedValue(
        Object.assign(new Error('User is not authorized to perform: ec2:DescribeVolumes'), {
          name: 'AccessDeniedException',
          code: 'AccessDeniedException',
          $metadata: {
            httpStatusCode: 403,
            requestId: 'request-789',
          },
        }),
      ),
    } as never);

    const error = await hydrateAwsEbsVolumes([
      {
        accountId: '123456789012',
        arn: 'arn:aws:ec2:eu-central-1:123456789012:volume/vol-123',
        properties: [],
        region: 'eu-central-1',
        resourceType: 'ec2:volume',
        service: 'ec2',
      },
    ]).catch((err) => err);

    expect(error).toMatchObject({
      code: 'AccessDeniedException',
      name: 'AccessDeniedException',
    });
    expect((error as Error).message).toBe(
      'Amazon EC2 DescribeVolumes failed in eu-central-1 with AccessDeniedException: User is not authorized to perform: ec2:DescribeVolumes Request ID: request-789.',
    );
  });
});

describe('hydrateAwsEbsSnapshots', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates discovered EBS snapshots by batching snapshot ids per region', async () => {
    mockedCreateEc2Client.mockImplementation(() => {
      const send = vi.fn(async (command: DescribeSnapshotsCommand) => {
        const input = command.input as { SnapshotIds?: string[] };

        return {
          Snapshots: (input.SnapshotIds ?? []).map((snapshotId) => ({
            SnapshotId: snapshotId,
            StartTime:
              snapshotId === 'snap-123' ? new Date('2025-01-01T00:00:00.000Z') : new Date('2025-02-01T00:00:00.000Z'),
            State: snapshotId === 'snap-123' ? 'completed' : 'pending',
            VolumeId: snapshotId === 'snap-123' ? 'vol-123' : 'vol-456',
            VolumeSize: snapshotId === 'snap-123' ? 128 : 512,
          })),
        };
      });

      return { send } as never;
    });

    const snapshots = await hydrateAwsEbsSnapshots([
      {
        accountId: '123456789012',
        arn: 'arn:aws:ec2:us-east-1:123456789012:snapshot/snap-123',
        properties: [],
        region: 'us-east-1',
        resourceType: 'ec2:snapshot',
        service: 'ec2',
      },
      {
        accountId: '123456789012',
        arn: 'arn:aws:ec2:us-east-1:123456789012:snapshot/snap-456',
        properties: [],
        region: 'us-east-1',
        resourceType: 'ec2:snapshot',
        service: 'ec2',
      },
    ]);

    expect(mockedCreateEc2Client).toHaveBeenCalledTimes(1);
    expect(snapshots).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        snapshotId: 'snap-123',
        startTime: '2025-01-01T00:00:00.000Z',
        state: 'completed',
        volumeId: 'vol-123',
        volumeSizeGiB: 128,
      },
      {
        accountId: '123456789012',
        region: 'us-east-1',
        snapshotId: 'snap-456',
        startTime: '2025-02-01T00:00:00.000Z',
        state: 'pending',
        volumeId: 'vol-456',
        volumeSizeGiB: 512,
      },
    ]);
  });

  it('preserves EC2 API context when snapshot hydration is access denied', async () => {
    mockedCreateEc2Client.mockReturnValue({
      send: vi.fn().mockRejectedValue(
        Object.assign(new Error('User is not authorized to perform: ec2:DescribeSnapshots'), {
          name: 'AccessDeniedException',
          code: 'AccessDeniedException',
          $metadata: {
            httpStatusCode: 403,
            requestId: 'request-snapshots',
          },
        }),
      ),
    } as never);

    const error = await hydrateAwsEbsSnapshots([
      {
        accountId: '123456789012',
        arn: 'arn:aws:ec2:eu-central-1:123456789012:snapshot/snap-123',
        properties: [],
        region: 'eu-central-1',
        resourceType: 'ec2:snapshot',
        service: 'ec2',
      },
    ]).catch((err) => err);

    expect(error).toMatchObject({
      code: 'AccessDeniedException',
      name: 'AccessDeniedException',
    });
    expect((error as Error).message).toBe(
      'Amazon EC2 DescribeSnapshots failed in eu-central-1 with AccessDeniedException: User is not authorized to perform: ec2:DescribeSnapshots Request ID: request-snapshots.',
    );
  });
});
