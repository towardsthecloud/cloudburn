import type { GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import type { DescribeNatGatewaysCommand, DescribeVpcEndpointsCommand } from '@aws-sdk/client-ec2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudWatchClient, createEc2Client } from '../../src/providers/aws/client.js';
import { hydrateAwsEc2NatGatewayActivity } from '../../src/providers/aws/resources/ec2-nat-gateways.js';
import { hydrateAwsEc2VpcEndpointActivity } from '../../src/providers/aws/resources/vpc-endpoints.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createCloudWatchClient: vi.fn(),
  createEc2Client: vi.fn(),
}));

const mockedCreateCloudWatchClient = vi.mocked(createCloudWatchClient);
const mockedCreateEc2Client = vi.mocked(createEc2Client);

const metricResponse = (command: GetMetricDataCommand) => ({
  MetricDataResults: (command.input.MetricDataQueries ?? []).map((query) => {
    const dimension = query.MetricStat?.Metric?.Dimensions?.find((entry) =>
      ['NatGatewayId', 'VPC Endpoint Id'].includes(entry.Name ?? ''),
    );
    const resourceIndex = Number(dimension?.Value?.split('-').at(-1));
    const count = Math.round(
      ((command.input.EndTime?.getTime() ?? 0) - (command.input.StartTime?.getTime() ?? 0)) / 86_400_000,
    );
    const timestamps = Array.from(
      { length: count - (resourceIndex === 124 ? 1 : 0) },
      (_, index) => new Date((command.input.StartTime?.getTime() ?? 0) + index * 86_400_000),
    );
    return {
      Id: query.Id,
      StatusCode: 'Complete',
      Timestamps: timestamps,
      Values: timestamps.map(() => resourceIndex + 1),
    };
  }),
});

describe('network resource metric batching', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('packs NAT metrics across describe batches and preserves resource-specific complete and incomplete totals', async () => {
    const describeSizes: number[] = [];
    mockedCreateEc2Client.mockReturnValue({
      send: vi.fn(async (command: DescribeNatGatewaysCommand) => {
        const ids = command.input.NatGatewayIds ?? [];
        describeSizes.push(ids.length);
        return {
          NatGateways: [...ids, 'nat-unselected'].map((NatGatewayId) => ({
            NatGatewayId,
            State: 'available',
            SubnetId: 'subnet-123',
          })),
        };
      }),
    } as never);
    const metricSizes: number[] = [];
    mockedCreateCloudWatchClient.mockReturnValue({
      send: vi.fn(async (command: GetMetricDataCommand) => {
        metricSizes.push(command.input.MetricDataQueries?.length ?? 0);
        return metricResponse(command);
      }),
    } as never);

    const result = await hydrateAwsEc2NatGatewayActivity(
      Array.from({ length: 125 }, (_, index) => ({
        accountId: '123456789012',
        arn: `arn:aws:ec2:us-east-1:123456789012:natgateway/nat-${index}`,
        region: 'us-east-1',
        service: 'ec2',
        resourceType: 'ec2:natgateway',
        properties: [],
      })),
    );

    expect(describeSizes).toEqual([100, 25]);
    expect(metricSizes).toEqual([250]);
    expect(result).toHaveLength(125);
    expect(result.find((gateway) => gateway.natGatewayId === 'nat-0')).toMatchObject({
      bytesInFromDestinationLast7Days: 7,
      bytesOutToDestinationLast7Days: 7,
    });
    expect(result.find((gateway) => gateway.natGatewayId === 'nat-100')).toMatchObject({
      bytesInFromDestinationLast7Days: 707,
      bytesOutToDestinationLast7Days: 707,
    });
    expect(result.find((gateway) => gateway.natGatewayId === 'nat-124')).toMatchObject({
      bytesInFromDestinationLast7Days: null,
      bytesOutToDestinationLast7Days: null,
    });
  });
  it('packs interface endpoint metrics across describe batches and preserves selected scope and incomplete totals', async () => {
    const describeSizes: number[] = [];
    mockedCreateEc2Client.mockReturnValue({
      send: vi.fn(async (command: DescribeVpcEndpointsCommand) => {
        const ids = command.input.VpcEndpointIds ?? [];
        describeSizes.push(ids.length);
        return {
          VpcEndpoints: [...ids, 'vpce-unselected'].map((VpcEndpointId) => ({
            VpcEndpointId,
            VpcEndpointType: 'Interface',
            VpcId: 'vpc-123',
            ServiceName: 'com.amazonaws.us-east-1.logs',
            SubnetIds: ['subnet-123'],
          })),
        };
      }),
    } as never);
    const metricSizes: number[] = [];
    mockedCreateCloudWatchClient.mockReturnValue({
      send: vi.fn(async (command: GetMetricDataCommand) => {
        metricSizes.push(command.input.MetricDataQueries?.length ?? 0);
        return metricResponse(command);
      }),
    } as never);

    const result = await hydrateAwsEc2VpcEndpointActivity(
      Array.from({ length: 125 }, (_, index) => ({
        accountId: '123456789012',
        arn: `arn:aws:ec2:us-east-1:123456789012:vpc-endpoint/vpce-${index}`,
        region: 'us-east-1',
        service: 'ec2',
        resourceType: 'ec2:vpc-endpoint',
        properties: [],
      })),
    );

    expect(describeSizes).toEqual([100, 25]);
    expect(metricSizes).toEqual([125]);
    expect(result).toHaveLength(125);
    expect(result.find((endpoint) => endpoint.vpcEndpointId === 'vpce-0')?.bytesProcessedLast30Days).toBe(30);
    expect(result.find((endpoint) => endpoint.vpcEndpointId === 'vpce-100')?.bytesProcessedLast30Days).toBe(3030);
    expect(result.find((endpoint) => endpoint.vpcEndpointId === 'vpce-124')?.bytesProcessedLast30Days).toBeNull();
  });
});
