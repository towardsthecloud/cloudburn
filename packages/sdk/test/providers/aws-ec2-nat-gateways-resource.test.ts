import type { DescribeNatGatewaysCommand } from '@aws-sdk/client-ec2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEc2Client } from '../../src/providers/aws/client.js';
import { fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';
import { hydrateAwsEc2NatGatewayActivity } from '../../src/providers/aws/resources/ec2-nat-gateways.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createEc2Client: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/cloudwatch.js', () => ({
  fetchCloudWatchSignals: vi.fn(),
}));

const mockedCreateEc2Client = vi.mocked(createEc2Client);
const mockedFetchCloudWatchSignals = vi.mocked(fetchCloudWatchSignals);

const createDailyPoints = (count: number, value: number) =>
  Array.from({ length: count }, (_, index) => ({
    timestamp: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    value,
  }));

describe('hydrateAwsEc2NatGatewayActivity', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates available NAT gateways with 7-day inbound and outbound traffic totals', async () => {
    mockedCreateEc2Client.mockReturnValue({
      send: vi.fn(async (_command: DescribeNatGatewaysCommand) => ({
        NatGateways: [
          {
            NatGatewayId: 'nat-123',
            State: 'available',
            SubnetId: 'subnet-123',
          },
          {
            NatGatewayId: 'nat-456',
            State: 'failed',
            SubnetId: 'subnet-456',
          },
        ],
      })),
    } as never);
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        ['natIn0', createDailyPoints(7, 0)],
        ['natOut0', createDailyPoints(7, 0)],
      ]),
    );

    await expect(
      hydrateAwsEc2NatGatewayActivity([
        {
          accountId: '123456789012',
          arn: 'arn:aws:ec2:us-east-1:123456789012:natgateway/nat-123',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ec2:natgateway',
          service: 'ec2',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        bytesInFromDestinationLast7Days: 0,
        bytesOutToDestinationLast7Days: 0,
        natGatewayId: 'nat-123',
        region: 'us-east-1',
        state: 'available',
        subnetId: 'subnet-123',
      },
    ]);
  });

  it('preserves unknown traffic totals when CloudWatch coverage is incomplete', async () => {
    mockedCreateEc2Client.mockReturnValue({
      send: vi.fn(async (_command: DescribeNatGatewaysCommand) => ({
        NatGateways: [
          {
            NatGatewayId: 'nat-123',
            State: 'available',
            SubnetId: 'subnet-123',
          },
        ],
      })),
    } as never);
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        ['natIn0', createDailyPoints(6, 0)],
        ['natOut0', createDailyPoints(7, 0)],
      ]),
    );

    await expect(
      hydrateAwsEc2NatGatewayActivity([
        {
          accountId: '123456789012',
          arn: 'arn:aws:ec2:us-east-1:123456789012:natgateway/nat-123',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ec2:natgateway',
          service: 'ec2',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        bytesInFromDestinationLast7Days: null,
        bytesOutToDestinationLast7Days: 0,
        natGatewayId: 'nat-123',
        region: 'us-east-1',
        state: 'available',
        subnetId: 'subnet-123',
      },
    ]);
  });
});
