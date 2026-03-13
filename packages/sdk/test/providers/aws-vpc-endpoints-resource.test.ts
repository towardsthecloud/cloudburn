import type { DescribeVpcEndpointsCommand } from '@aws-sdk/client-ec2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEc2Client } from '../../src/providers/aws/client.js';
import { fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';
import { hydrateAwsEc2VpcEndpointActivity } from '../../src/providers/aws/resources/vpc-endpoints.js';

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
    timestamp: `2026-02-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    value,
  }));

describe('hydrateAwsEc2VpcEndpointActivity', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates interface endpoints with 30-day traffic totals', async () => {
    mockedCreateEc2Client.mockReturnValue({
      send: vi.fn(async (_command: DescribeVpcEndpointsCommand) => ({
        VpcEndpoints: [
          {
            ServiceName: 'com.amazonaws.us-east-1.logs',
            SubnetIds: ['subnet-123'],
            VpcEndpointId: 'vpce-123',
            VpcEndpointType: 'Interface',
            VpcId: 'vpc-123',
          },
          {
            ServiceName: 'com.amazonaws.us-east-1.s3',
            SubnetIds: ['subnet-456'],
            VpcEndpointId: 'vpce-456',
            VpcEndpointType: 'Gateway',
            VpcId: 'vpc-123',
          },
        ],
      })),
    } as never);
    mockedFetchCloudWatchSignals.mockResolvedValue(new Map([['vpce0', createDailyPoints(30, 0)]]));

    await expect(
      hydrateAwsEc2VpcEndpointActivity([
        {
          accountId: '123456789012',
          arn: 'arn:aws:ec2:us-east-1:123456789012:vpc-endpoint/vpce-123',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ec2:vpc-endpoint',
          service: 'ec2',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        bytesProcessedLast30Days: 0,
        region: 'us-east-1',
        serviceName: 'com.amazonaws.us-east-1.logs',
        subnetIds: ['subnet-123'],
        vpcEndpointId: 'vpce-123',
        vpcEndpointType: 'interface',
        vpcId: 'vpc-123',
      },
    ]);
  });

  it('preserves unknown traffic totals when CloudWatch returns no datapoints', async () => {
    mockedCreateEc2Client.mockReturnValue({
      send: vi.fn(async (_command: DescribeVpcEndpointsCommand) => ({
        VpcEndpoints: [
          {
            ServiceName: 'com.amazonaws.us-east-1.logs',
            SubnetIds: ['subnet-123'],
            VpcEndpointId: 'vpce-123',
            VpcEndpointType: 'Interface',
            VpcId: 'vpc-123',
          },
        ],
      })),
    } as never);
    mockedFetchCloudWatchSignals.mockResolvedValue(new Map());

    await expect(
      hydrateAwsEc2VpcEndpointActivity([
        {
          accountId: '123456789012',
          arn: 'arn:aws:ec2:us-east-1:123456789012:vpc-endpoint/vpce-123',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ec2:vpc-endpoint',
          service: 'ec2',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        bytesProcessedLast30Days: null,
        region: 'us-east-1',
        serviceName: 'com.amazonaws.us-east-1.logs',
        subnetIds: ['subnet-123'],
        vpcEndpointId: 'vpce-123',
        vpcEndpointType: 'interface',
        vpcId: 'vpc-123',
      },
    ]);
  });

  it('preserves unknown traffic totals when CloudWatch returns partial 30-day coverage', async () => {
    mockedCreateEc2Client.mockReturnValue({
      send: vi.fn(async (_command: DescribeVpcEndpointsCommand) => ({
        VpcEndpoints: [
          {
            ServiceName: 'com.amazonaws.us-east-1.logs',
            SubnetIds: ['subnet-123'],
            VpcEndpointId: 'vpce-123',
            VpcEndpointType: 'Interface',
            VpcId: 'vpc-123',
          },
        ],
      })),
    } as never);
    mockedFetchCloudWatchSignals.mockResolvedValue(new Map([['vpce0', createDailyPoints(29, 0)]]));

    await expect(
      hydrateAwsEc2VpcEndpointActivity([
        {
          accountId: '123456789012',
          arn: 'arn:aws:ec2:us-east-1:123456789012:vpc-endpoint/vpce-123',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ec2:vpc-endpoint',
          service: 'ec2',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        bytesProcessedLast30Days: null,
        region: 'us-east-1',
        serviceName: 'com.amazonaws.us-east-1.logs',
        subnetIds: ['subnet-123'],
        vpcEndpointId: 'vpce-123',
        vpcEndpointType: 'interface',
        vpcId: 'vpc-123',
      },
    ]);
  });

  it('skips stale VPC endpoints that no longer exist during hydration', async () => {
    mockedCreateEc2Client.mockReturnValue({
      send: vi.fn(async (command: DescribeVpcEndpointsCommand) => {
        const input = command.input as { VpcEndpointIds?: string[] };
        const endpointIds = input.VpcEndpointIds ?? [];

        if (endpointIds.length > 1) {
          const error = new Error('The VPC endpoint service does not exist');
          error.name = 'InvalidVpcEndpointId.NotFound';
          throw error;
        }

        if (endpointIds[0] === 'vpce-stale') {
          const error = new Error('The VPC endpoint service does not exist');
          error.name = 'InvalidVpcEndpointId.NotFound';
          throw error;
        }

        return {
          VpcEndpoints: [
            {
              ServiceName: 'com.amazonaws.us-east-1.logs',
              SubnetIds: ['subnet-123'],
              VpcEndpointId: 'vpce-live',
              VpcEndpointType: 'Interface',
              VpcId: 'vpc-123',
            },
          ],
        };
      }),
    } as never);
    mockedFetchCloudWatchSignals.mockResolvedValue(new Map([['vpce0', createDailyPoints(30, 0)]]));

    await expect(
      hydrateAwsEc2VpcEndpointActivity([
        {
          accountId: '123456789012',
          arn: 'arn:aws:ec2:us-east-1:123456789012:vpc-endpoint/vpce-live',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ec2:vpc-endpoint',
          service: 'ec2',
        },
        {
          accountId: '123456789012',
          arn: 'arn:aws:ec2:us-east-1:123456789012:vpc-endpoint/vpce-stale',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ec2:vpc-endpoint',
          service: 'ec2',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        bytesProcessedLast30Days: 0,
        region: 'us-east-1',
        serviceName: 'com.amazonaws.us-east-1.logs',
        subnetIds: ['subnet-123'],
        vpcEndpointId: 'vpce-live',
        vpcEndpointType: 'interface',
        vpcId: 'vpc-123',
      },
    ]);
  });

  it('skips stale VPC endpoint IDs that no longer exist during hydration', async () => {
    const send = vi.fn(async (command: DescribeVpcEndpointsCommand) => {
      const input = command.input as { VpcEndpointIds?: string[] };
      const endpointIds = input.VpcEndpointIds ?? [];

      if (endpointIds.includes('vpce-stale')) {
        throw Object.assign(new Error('The VPC endpoint does not exist'), {
          code: 'InvalidVpcEndpointId.NotFound',
          name: 'InvalidVpcEndpointId.NotFound',
          $metadata: {
            requestId: 'request-stale',
          },
        });
      }

      return {
        VpcEndpoints: endpointIds.map((endpointId) => ({
          ServiceName: 'com.amazonaws.us-east-1.logs',
          SubnetIds: ['subnet-123'],
          VpcEndpointId: endpointId,
          VpcEndpointType: 'Interface',
          VpcId: 'vpc-123',
        })),
      };
    });

    mockedCreateEc2Client.mockReturnValue({ send } as never);
    mockedFetchCloudWatchSignals.mockResolvedValue(new Map([['vpce0', createDailyPoints(30, 0)]]));

    await expect(
      hydrateAwsEc2VpcEndpointActivity([
        {
          accountId: '123456789012',
          arn: 'arn:aws:ec2:us-east-1:123456789012:vpc-endpoint/vpce-123',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ec2:vpc-endpoint',
          service: 'ec2',
        },
        {
          accountId: '123456789012',
          arn: 'arn:aws:ec2:us-east-1:123456789012:vpc-endpoint/vpce-stale',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ec2:vpc-endpoint',
          service: 'ec2',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        bytesProcessedLast30Days: 0,
        region: 'us-east-1',
        serviceName: 'com.amazonaws.us-east-1.logs',
        subnetIds: ['subnet-123'],
        vpcEndpointId: 'vpce-123',
        vpcEndpointType: 'interface',
        vpcId: 'vpc-123',
      },
    ]);

    expect(send).toHaveBeenCalledTimes(3);
  });
});
