import { describe, expect, it, vi } from 'vitest';
import { hydrateAwsUntaggedResources } from '../../src/providers/aws/resources/tagging.js';

describe('hydrateAwsUntaggedResources', () => {
  it('loads all taggable resources without user-created tags through Resource Explorer', async () => {
    const listResourcesByFilter = vi.fn().mockResolvedValue([
      {
        accountId: '123456789012',
        arn: 'arn:aws:ec2:eu-west-1:123456789012:instance/i-123',
        properties: [],
        region: 'eu-west-1',
        resourceType: 'ec2:instance',
        service: 'ec2',
      },
    ]);

    await expect(
      hydrateAwsUntaggedResources([], {
        listResourcesByFilter,
        loadDataset: vi.fn(),
      }),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        arn: 'arn:aws:ec2:eu-west-1:123456789012:instance/i-123',
        region: 'eu-west-1',
        resourceType: 'ec2:instance',
        service: 'ec2',
      },
    ]);
    expect(listResourcesByFilter).toHaveBeenCalledWith('resourcetype.supports:tags tag:none', {
      requiredViewProperties: ['tags'],
      scope: 'account',
    });
  });
});
