import type { DescribeAddressesCommand } from '@aws-sdk/client-ec2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEc2Client } from '../../src/providers/aws/client.js';
import { hydrateAwsEc2ElasticIps } from '../../src/providers/aws/resources/ec2-elastic-ips.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createEc2Client: vi.fn(),
}));

const mockedCreateEc2Client = vi.mocked(createEc2Client);

describe('hydrateAwsEc2ElasticIps', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates elastic IPs with association metadata', async () => {
    mockedCreateEc2Client.mockImplementation(
      () =>
        ({
          send: vi.fn(async (command: DescribeAddressesCommand) => {
            const input = command.input as { AllocationIds?: string[] };

            return {
              Addresses: (input.AllocationIds ?? []).map((allocationId, index) => ({
                AllocationId: allocationId,
                ...(index === 0
                  ? {}
                  : {
                      AssociationId: `eipassoc-${index}`,
                      InstanceId: `i-${index}`,
                    }),
                PublicIp: `203.0.113.${10 + index}`,
              })),
            };
          }),
        }) as never,
    );

    await expect(
      hydrateAwsEc2ElasticIps([
        {
          accountId: '123456789012',
          arn: 'arn:aws:ec2:us-east-1:123456789012:elastic-ip/eipalloc-123',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ec2:elastic-ip',
          service: 'ec2',
        },
        {
          accountId: '123456789012',
          arn: 'arn:aws:ec2:us-east-1:123456789012:elastic-ip/eipalloc-456',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ec2:elastic-ip',
          service: 'ec2',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        allocationId: 'eipalloc-123',
        publicIp: '203.0.113.10',
        region: 'us-east-1',
      },
      {
        accountId: '123456789012',
        allocationId: 'eipalloc-456',
        associationId: 'eipassoc-1',
        instanceId: 'i-1',
        publicIp: '203.0.113.11',
        region: 'us-east-1',
      },
    ]);
  });

  it('skips stale Elastic IPs that no longer exist during hydration', async () => {
    mockedCreateEc2Client.mockReturnValue({
      send: vi.fn(async (command: DescribeAddressesCommand) => {
        const input = command.input as { AllocationIds?: string[] };
        const allocationIds = input.AllocationIds ?? [];

        if (allocationIds.length > 1) {
          const error = new Error('The address allocation ID does not exist');
          error.name = 'InvalidAllocationID.NotFound';
          throw error;
        }

        if (allocationIds[0] === 'eipalloc-stale') {
          const error = new Error('The address allocation ID does not exist');
          error.name = 'InvalidAllocationID.NotFound';
          throw error;
        }

        return {
          Addresses: [
            {
              AllocationId: 'eipalloc-live',
              PublicIp: '203.0.113.10',
            },
          ],
        };
      }),
    } as never);

    await expect(
      hydrateAwsEc2ElasticIps([
        {
          accountId: '123456789012',
          arn: 'arn:aws:ec2:us-east-1:123456789012:elastic-ip/eipalloc-live',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ec2:elastic-ip',
          service: 'ec2',
        },
        {
          accountId: '123456789012',
          arn: 'arn:aws:ec2:us-east-1:123456789012:elastic-ip/eipalloc-stale',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ec2:elastic-ip',
          service: 'ec2',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        allocationId: 'eipalloc-live',
        publicIp: '203.0.113.10',
        region: 'us-east-1',
      },
    ]);
  });

  it('skips stale elastic IP allocation IDs that no longer exist during hydration', async () => {
    const send = vi.fn(async (command: DescribeAddressesCommand) => {
      const input = command.input as { AllocationIds?: string[] };
      const allocationIds = input.AllocationIds ?? [];

      if (allocationIds.includes('eipalloc-stale')) {
        throw Object.assign(new Error('The address does not exist'), {
          code: 'InvalidAllocationID.NotFound',
          name: 'InvalidAllocationID.NotFound',
          $metadata: {
            requestId: 'request-stale',
          },
        });
      }

      return {
        Addresses: allocationIds.map((allocationId) => ({
          AllocationId: allocationId,
          PublicIp: allocationId === 'eipalloc-123' ? '203.0.113.10' : '203.0.113.99',
        })),
      };
    });

    mockedCreateEc2Client.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsEc2ElasticIps([
        {
          accountId: '123456789012',
          arn: 'arn:aws:ec2:us-east-1:123456789012:elastic-ip/eipalloc-123',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ec2:elastic-ip',
          service: 'ec2',
        },
        {
          accountId: '123456789012',
          arn: 'arn:aws:ec2:us-east-1:123456789012:elastic-ip/eipalloc-stale',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ec2:elastic-ip',
          service: 'ec2',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        allocationId: 'eipalloc-123',
        publicIp: '203.0.113.10',
        region: 'us-east-1',
      },
    ]);

    expect(send).toHaveBeenCalledTimes(3);
  });
});
