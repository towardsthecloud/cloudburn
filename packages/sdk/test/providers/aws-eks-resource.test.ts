import type { DescribeNodegroupCommand, ListNodegroupsCommand } from '@aws-sdk/client-eks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEksClient } from '../../src/providers/aws/client.js';
import { hydrateAwsEksNodegroups } from '../../src/providers/aws/resources/eks.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createEksClient: vi.fn(),
}));

const mockedCreateEksClient = vi.mocked(createEksClient);

describe('hydrateAwsEksNodegroups', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates managed node groups discovered from EKS clusters', async () => {
    const send = vi.fn(async (command: ListNodegroupsCommand | DescribeNodegroupCommand) => {
      if (command.constructor.name === 'ListNodegroupsCommand') {
        const input = (command as ListNodegroupsCommand).input as { clusterName?: string };

        expect(input.clusterName).toBe('production');

        return {
          nodegroups: ['workers'],
        };
      }

      const input = (command as DescribeNodegroupCommand).input as { clusterName?: string; nodegroupName?: string };

      expect(input.clusterName).toBe('production');
      expect(input.nodegroupName).toBe('workers');

      return {
        nodegroup: {
          amiType: 'AL2023_x86_64_STANDARD',
          instanceTypes: ['m7i.large'],
          nodegroupArn: 'arn:aws:eks:us-east-1:123456789012:nodegroup/production/workers/abc123',
          nodegroupName: 'workers',
        },
      };
    });

    mockedCreateEksClient.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsEksNodegroups([
        {
          accountId: '123456789012',
          arn: 'arn:aws:eks:us-east-1:123456789012:cluster/production',
          properties: [],
          region: 'us-east-1',
          resourceType: 'eks:cluster',
          service: 'eks',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        amiType: 'AL2023_x86_64_STANDARD',
        clusterArn: 'arn:aws:eks:us-east-1:123456789012:cluster/production',
        clusterName: 'production',
        instanceTypes: ['m7i.large'],
        nodegroupArn: 'arn:aws:eks:us-east-1:123456789012:nodegroup/production/workers/abc123',
        nodegroupName: 'workers',
        region: 'us-east-1',
      },
    ]);
  });
});
