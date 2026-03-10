import { describe, expect, it, vi } from 'vitest';
import * as clientModule from '../../src/providers/aws/client.js';
import { buildAwsDiscoveryCatalog, listAwsDiscoveryIndexes } from '../../src/providers/aws/resource-explorer.js';

describe('resource explorer discovery', () => {
  it('builds a deduplicated catalog and applies a region filter when listing from an aggregator region', async () => {
    vi.spyOn(clientModule, 'resolveCurrentAwsRegion').mockResolvedValue('eu-central-1');

    const send = vi
      .fn()
      .mockImplementationOnce(async () => ({
        Indexes: [
          {
            Region: 'eu-central-1',
            Type: 'AGGREGATOR',
          },
        ],
      }))
      .mockImplementationOnce(async () => ({
        ViewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
      }))
      .mockImplementationOnce(async () => ({
        View: {
          Filters: {
            FilterString: '',
          },
          ViewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
        },
      }))
      .mockImplementationOnce(async (command) => {
        expect(command.input.Filters?.FilterString).toBe('resourcetype:ec2:volume region:eu-central-1');
        expect(command.input.ViewArn).toBe('arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default');

        return {
          Resources: [
            {
              Arn: 'arn:aws:ec2:eu-central-1:123456789012:volume/vol-123',
              OwningAccountId: '123456789012',
              Region: 'eu-central-1',
              ResourceType: 'ec2:volume',
              Service: 'ec2',
              Properties: [],
            },
          ],
          ViewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
        };
      })
      .mockImplementationOnce(async (command) => {
        expect(command.input.Filters?.FilterString).toBe('resourcetype:lambda:function region:eu-central-1');
        expect(command.input.ViewArn).toBe('arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default');

        return {
          Resources: [
            {
              Arn: 'arn:aws:lambda:eu-central-1:123456789012:function:my-func',
              OwningAccountId: '123456789012',
              Region: 'eu-central-1',
              ResourceType: 'lambda:function',
              Service: 'lambda',
              Properties: [],
            },
            {
              Arn: 'arn:aws:ec2:eu-central-1:123456789012:volume/vol-123',
              OwningAccountId: '123456789012',
              Region: 'eu-central-1',
              ResourceType: 'ec2:volume',
              Service: 'ec2',
              Properties: [],
            },
          ],
          ViewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
        };
      });

    vi.spyOn(clientModule, 'createResourceExplorerClient').mockReturnValue({
      send,
    } as never);

    await expect(buildAwsDiscoveryCatalog({ mode: 'current' }, ['ec2:volume', 'lambda:function'])).resolves.toEqual({
      resources: [
        {
          arn: 'arn:aws:ec2:eu-central-1:123456789012:volume/vol-123',
          accountId: '123456789012',
          region: 'eu-central-1',
          resourceType: 'ec2:volume',
          service: 'ec2',
          properties: [],
        },
        {
          arn: 'arn:aws:lambda:eu-central-1:123456789012:function:my-func',
          accountId: '123456789012',
          region: 'eu-central-1',
          resourceType: 'lambda:function',
          service: 'lambda',
          properties: [],
        },
      ],
      searchRegion: 'eu-central-1',
      indexType: 'AGGREGATOR',
      viewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
    });
  });

  it('fails when no Resource Explorer indexes are enabled', async () => {
    vi.spyOn(clientModule, 'resolveCurrentAwsRegion').mockResolvedValue('eu-central-1');
    vi.spyOn(clientModule, 'createResourceExplorerClient').mockReturnValue({
      send: vi.fn().mockResolvedValue({
        Indexes: [],
      }),
    } as never);

    await expect(buildAwsDiscoveryCatalog({ mode: 'current' }, ['ec2:volume'])).rejects.toMatchObject({
      code: 'RESOURCE_EXPLORER_NOT_ENABLED',
    });
  });

  it('fails when the selected search region has no default view configured', async () => {
    vi.spyOn(clientModule, 'resolveCurrentAwsRegion').mockResolvedValue('eu-central-1');
    vi.spyOn(clientModule, 'createResourceExplorerClient').mockReturnValue({
      send: vi
        .fn()
        .mockResolvedValueOnce({
          Indexes: [
            {
              Region: 'eu-central-1',
              Type: 'AGGREGATOR',
            },
          ],
        })
        .mockResolvedValueOnce({}),
    } as never);

    await expect(buildAwsDiscoveryCatalog({ mode: 'current' }, ['ec2:volume'])).rejects.toMatchObject({
      code: 'RESOURCE_EXPLORER_DEFAULT_VIEW_REQUIRED',
    });
  });

  it('fails when the selected default view applies additional filters', async () => {
    vi.spyOn(clientModule, 'resolveCurrentAwsRegion').mockResolvedValue('eu-central-1');
    vi.spyOn(clientModule, 'createResourceExplorerClient').mockReturnValue({
      send: vi
        .fn()
        .mockResolvedValueOnce({
          Indexes: [
            {
              Region: 'eu-central-1',
              Type: 'AGGREGATOR',
            },
          ],
        })
        .mockResolvedValueOnce({
          ViewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
        })
        .mockResolvedValueOnce({
          View: {
            Filters: {
              FilterString: 'tag:Environment=prod',
            },
            ViewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
          },
          ViewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
        }),
    } as never);

    const error = await buildAwsDiscoveryCatalog({ mode: 'current' }, ['ec2:volume']).catch((err) => err);

    expect(error).toMatchObject({
      code: 'RESOURCE_EXPLORER_FILTERED_VIEW_UNSUPPORTED',
    });
    expect((error as Error).message).not.toContain('tag:Environment=prod');
  });

  it('fails when an explicit discovery region is malformed', async () => {
    vi.spyOn(clientModule, 'resolveCurrentAwsRegion').mockResolvedValue('eu-central-1');
    vi.spyOn(clientModule, 'createResourceExplorerClient').mockReturnValue({
      send: vi.fn().mockResolvedValue({
        Indexes: [
          {
            Region: 'eu-central-1',
            Type: 'AGGREGATOR',
          },
        ],
      }),
    } as never);

    await expect(
      buildAwsDiscoveryCatalog({ mode: 'region', region: 'eu-central-1 resourcetype:s3:bucket' }, ['ec2:volume']),
    ).rejects.toMatchObject({
      code: 'INVALID_AWS_REGION',
    });
  });

  it('lists enabled index regions from the current control region', async () => {
    vi.spyOn(clientModule, 'resolveCurrentAwsRegion').mockResolvedValue('us-east-1');
    vi.spyOn(clientModule, 'createResourceExplorerClient').mockReturnValue({
      send: vi.fn().mockResolvedValue({
        Indexes: [
          {
            Region: 'eu-west-1',
            Type: 'LOCAL',
          },
          {
            Region: 'us-east-1',
            Type: 'AGGREGATOR',
          },
        ],
      }),
    } as never);

    await expect(listAwsDiscoveryIndexes()).resolves.toEqual([
      { region: 'eu-west-1', type: 'local' },
      { region: 'us-east-1', type: 'aggregator' },
    ]);
  });
});
