import { describe, expect, it, vi } from 'vitest';
import * as clientModule from '../../src/providers/aws/client.js';
import {
  buildAwsDiscoveryCatalog,
  createAwsResourceExplorerSetup,
  listAwsDiscoveryIndexes,
} from '../../src/providers/aws/resource-explorer.js';

describe('resource explorer discovery', () => {
  it('builds a deduplicated catalog and applies a region filter when listing from an aggregator region', async () => {
    vi.spyOn(clientModule, 'resolveCurrentAwsRegion').mockResolvedValue('eu-central-1');

    const send = vi
      .fn()
      .mockImplementationOnce(async (command) => {
        expect(command.input.Regions).toEqual(['eu-central-1']);

        return {
          Indexes: [
            {
              Region: 'eu-central-1',
              Type: 'AGGREGATOR',
            },
          ],
        };
      })
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
        expect(command.input.Filters?.FilterString).toBe('resourcetype:ec2:volume,lambda:function region:eu-central-1');
        expect(command.input.MaxResults).toBe(1000);
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
            {
              Arn: 'arn:aws:lambda:eu-central-1:123456789012:function:my-func',
              OwningAccountId: '123456789012',
              Region: 'eu-central-1',
              ResourceType: 'lambda:function',
              Service: 'lambda',
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
      send: vi.fn().mockImplementation(async (command) => {
        expect(command.input.Regions).toEqual(['eu-central-1']);

        return {
          Indexes: [],
        };
      }),
    } as never);

    await expect(buildAwsDiscoveryCatalog({ mode: 'current' }, ['ec2:volume'])).rejects.toMatchObject({
      code: 'RESOURCE_EXPLORER_REGION_NOT_ENABLED',
    });
  });

  it('fails when the selected search region has no default view configured', async () => {
    vi.spyOn(clientModule, 'resolveCurrentAwsRegion').mockResolvedValue('eu-central-1');
    vi.spyOn(clientModule, 'createResourceExplorerClient').mockReturnValue({
      send: vi
        .fn()
        .mockImplementationOnce(async (command) => {
          expect(command.input.Regions).toEqual(['eu-central-1']);

          return {
            Indexes: [
              {
                Region: 'eu-central-1',
                Type: 'AGGREGATOR',
              },
            ],
          };
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
        .mockImplementationOnce(async (command) => {
          expect(command.input.Regions).toEqual(['eu-central-1']);

          return {
            Indexes: [
              {
                Region: 'eu-central-1',
                Type: 'AGGREGATOR',
              },
            ],
          };
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

  it('preserves Resource Explorer operation context when list resources is throttled', async () => {
    vi.spyOn(clientModule, 'resolveCurrentAwsRegion').mockResolvedValue('eu-central-1');
    vi.spyOn(clientModule, 'createResourceExplorerClient').mockReturnValue({
      send: vi
        .fn()
        .mockImplementationOnce(async (command) => {
          expect(command.input.Regions).toEqual(['eu-central-1']);

          return {
            Indexes: [
              {
                Region: 'eu-central-1',
                Type: 'AGGREGATOR',
              },
            ],
          };
        })
        .mockResolvedValueOnce({
          ViewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
        })
        .mockResolvedValueOnce({
          View: {
            Filters: {
              FilterString: '',
            },
            ViewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
          },
        })
        .mockRejectedValueOnce(
          Object.assign(new Error('Rate exceeded'), {
            name: 'ThrottlingException',
            $metadata: {
              httpStatusCode: 429,
              requestId: 'request-123',
            },
          }),
        )
        .mockRejectedValueOnce(
          Object.assign(new Error('Rate exceeded'), {
            name: 'ThrottlingException',
            $metadata: {
              httpStatusCode: 429,
              requestId: 'request-123',
            },
          }),
        )
        .mockRejectedValueOnce(
          Object.assign(new Error('Rate exceeded'), {
            name: 'ThrottlingException',
            $metadata: {
              httpStatusCode: 429,
              requestId: 'request-123',
            },
          }),
        )
        .mockRejectedValueOnce(
          Object.assign(new Error('Rate exceeded'), {
            name: 'ThrottlingException',
            $metadata: {
              httpStatusCode: 429,
              requestId: 'request-123',
            },
          }),
        )
        .mockRejectedValueOnce(
          Object.assign(new Error('Rate exceeded'), {
            name: 'ThrottlingException',
            $metadata: {
              httpStatusCode: 429,
              requestId: 'request-123',
            },
          }),
        ),
    } as never);

    await expect(buildAwsDiscoveryCatalog({ mode: 'current' }, ['ec2:volume'])).rejects.toMatchObject({
      message:
        'AWS Resource Explorer ListResources failed in eu-central-1 with ThrottlingException: Rate exceeded Request ID: request-123.',
    });
  });

  it('retries throttled list resources calls before succeeding', async () => {
    vi.spyOn(clientModule, 'resolveCurrentAwsRegion').mockResolvedValue('eu-central-1');
    vi.spyOn(clientModule, 'createResourceExplorerClient').mockReturnValue({
      send: vi
        .fn()
        .mockImplementationOnce(async (command) => {
          expect(command.input.Regions).toEqual(['eu-central-1']);

          return {
            Indexes: [
              {
                Region: 'eu-central-1',
                Type: 'AGGREGATOR',
              },
            ],
          };
        })
        .mockResolvedValueOnce({
          ViewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
        })
        .mockResolvedValueOnce({
          View: {
            Filters: {
              FilterString: '',
            },
            ViewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
          },
        })
        .mockRejectedValueOnce(
          Object.assign(new Error('Rate exceeded'), {
            name: 'ThrottlingException',
            $metadata: {
              httpStatusCode: 429,
              requestId: 'request-123',
            },
          }),
        )
        .mockResolvedValueOnce({
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
        }),
    } as never);

    await expect(buildAwsDiscoveryCatalog({ mode: 'current' }, ['ec2:volume'])).resolves.toMatchObject({
      resources: [{ arn: 'arn:aws:ec2:eu-central-1:123456789012:volume/vol-123' }],
    });
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
      buildAwsDiscoveryCatalog({ mode: 'regions', regions: ['eu-central-1 resourcetype:s3:bucket' as never] }, [
        'ec2:volume',
      ]),
    ).rejects.toMatchObject({
      code: 'INVALID_AWS_REGION',
    });
  });

  it('uses the explicit discovery region as the control plane instead of the current region', async () => {
    vi.spyOn(clientModule, 'resolveCurrentAwsRegion').mockResolvedValue('us-east-1');
    vi.spyOn(clientModule, 'listEnabledAwsRegions').mockResolvedValue(['eu-central-1']);

    const euCentralClient = {
      send: vi
        .fn()
        .mockImplementationOnce(async (command) => {
          expect(command.input.Regions).toEqual(['eu-central-1']);

          return {
            Indexes: [
              {
                Region: 'eu-central-1',
                Type: 'LOCAL',
              },
            ],
          };
        })
        .mockImplementationOnce(async (command) => {
          expect(command.input.Regions).toEqual(['eu-central-1']);

          return {
            Indexes: [
              {
                Region: 'eu-central-1',
                Type: 'LOCAL',
              },
            ],
          };
        })
        .mockResolvedValueOnce({
          ViewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
        })
        .mockResolvedValueOnce({
          View: {
            Filters: {
              FilterString: '',
            },
            ViewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
          },
        })
        .mockResolvedValueOnce({
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
        }),
    } as never;
    const createResourceExplorerClient = vi
      .spyOn(clientModule, 'createResourceExplorerClient')
      .mockImplementation(({ region }) => {
        expect(region).toBe('eu-central-1');
        return euCentralClient;
      });

    await expect(
      buildAwsDiscoveryCatalog({ mode: 'regions', regions: ['eu-central-1'] }, ['ec2:volume']),
    ).resolves.toEqual({
      resources: [
        {
          arn: 'arn:aws:ec2:eu-central-1:123456789012:volume/vol-123',
          accountId: '123456789012',
          region: 'eu-central-1',
          resourceType: 'ec2:volume',
          service: 'ec2',
          properties: [],
        },
      ],
      searchRegion: 'eu-central-1',
      indexType: 'LOCAL',
      viewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
    });
    expect(createResourceExplorerClient).toHaveBeenCalled();
  });

  it('uses the aggregator control plane for an explicit local region when the aggregator lives elsewhere', async () => {
    vi.spyOn(clientModule, 'resolveCurrentAwsRegion').mockResolvedValue('us-east-1');
    vi.spyOn(clientModule, 'listEnabledAwsRegions').mockResolvedValue(['eu-west-1', 'eu-central-1']);

    const euWestClient = {
      send: vi
        .fn()
        .mockImplementationOnce(async (command) => {
          expect(command.input.Regions).toEqual(['eu-west-1']);

          return {
            Indexes: [
              {
                Region: 'eu-west-1',
                Type: 'LOCAL',
              },
            ],
          };
        })
        .mockImplementationOnce(async (command) => {
          expect(command.input.Regions).toEqual(['eu-west-1']);

          return {
            Indexes: [
              {
                Region: 'eu-west-1',
                Type: 'LOCAL',
              },
            ],
          };
        }),
    } as never;
    const euCentralClient = {
      send: vi
        .fn()
        .mockImplementationOnce(async (command) => {
          expect(command.input.Regions).toEqual(['eu-central-1']);

          return {
            Indexes: [
              {
                Region: 'eu-central-1',
                Type: 'AGGREGATOR',
              },
            ],
          };
        })
        .mockResolvedValueOnce({
          ViewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
        })
        .mockResolvedValueOnce({
          View: {
            Filters: {
              FilterString: '',
            },
            ViewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
          },
        })
        .mockImplementationOnce(async (command) => {
          expect(command.input.Filters?.FilterString).toBe('resourcetype:ec2:volume region:eu-west-1');
          expect(command.input.MaxResults).toBe(1000);

          return {
            Resources: [
              {
                Arn: 'arn:aws:ec2:eu-west-1:123456789012:volume/vol-123',
                OwningAccountId: '123456789012',
                Region: 'eu-west-1',
                ResourceType: 'ec2:volume',
                Service: 'ec2',
                Properties: [],
              },
            ],
          };
        }),
    } as never;

    vi.spyOn(clientModule, 'createResourceExplorerClient').mockImplementation(({ region }) => {
      if (region === 'eu-west-1') {
        return euWestClient;
      }

      if (region === 'eu-central-1') {
        return euCentralClient;
      }

      throw new Error(`Unexpected client region ${region}`);
    });

    await expect(
      buildAwsDiscoveryCatalog({ mode: 'regions', regions: ['eu-west-1'] }, ['ec2:volume']),
    ).resolves.toEqual({
      resources: [
        {
          arn: 'arn:aws:ec2:eu-west-1:123456789012:volume/vol-123',
          accountId: '123456789012',
          region: 'eu-west-1',
          resourceType: 'ec2:volume',
          service: 'ec2',
          properties: [],
        },
      ],
      searchRegion: 'eu-central-1',
      indexType: 'AGGREGATOR',
      viewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
    });
  });

  it('fails when Resource Explorer returns a malformed index region', async () => {
    vi.spyOn(clientModule, 'resolveCurrentAwsRegion').mockResolvedValue('eu-central-1');
    vi.spyOn(clientModule, 'createResourceExplorerClient').mockReturnValue({
      send: vi.fn().mockImplementation(async (command) => {
        expect(command.input.Regions).toEqual(['eu-central-1']);

        return {
          Indexes: [
            {
              Region: 'eu-central-1 region:malicious',
              Type: 'AGGREGATOR',
            },
          ],
        };
      }),
    } as never);

    await expect(buildAwsDiscoveryCatalog({ mode: 'current' }, ['ec2:volume'])).rejects.toMatchObject({
      code: 'INVALID_AWS_REGION',
    });
  });

  it('uses a region-scoped index lookup for current-region discovery in SCP-constrained accounts', async () => {
    vi.spyOn(clientModule, 'resolveCurrentAwsRegion').mockResolvedValue('eu-central-1');
    vi.spyOn(clientModule, 'createResourceExplorerClient').mockReturnValue({
      send: vi
        .fn()
        .mockImplementationOnce(async (command) => {
          expect(command.input.Regions).toEqual(['eu-central-1']);

          return {
            Indexes: [
              {
                Region: 'eu-central-1',
                Type: 'AGGREGATOR',
              },
            ],
          };
        })
        .mockResolvedValueOnce({
          ViewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
        })
        .mockResolvedValueOnce({
          View: {
            Filters: {
              FilterString: '',
            },
          },
        })
        .mockResolvedValueOnce({
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
        }),
    } as never);

    await expect(buildAwsDiscoveryCatalog({ mode: 'current' }, ['ec2:volume'])).resolves.toEqual({
      resources: [
        {
          arn: 'arn:aws:ec2:eu-central-1:123456789012:volume/vol-123',
          accountId: '123456789012',
          region: 'eu-central-1',
          resourceType: 'ec2:volume',
          service: 'ec2',
          properties: [],
        },
      ],
      searchRegion: 'eu-central-1',
      indexType: 'AGGREGATOR',
      viewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
    });
  });

  it('limits multi-region discovery to accessible indexed regions while skipping denied regions', async () => {
    vi.spyOn(clientModule, 'listEnabledAwsRegions').mockResolvedValue(['ap-south-1', 'eu-central-1', 'eu-west-1']);

    const apSouthClient = {
      send: vi.fn().mockRejectedValue(
        Object.assign(new Error('explicit deny'), {
          name: 'AccessDeniedException',
          $metadata: {
            httpStatusCode: 403,
          },
        }),
      ),
    } as never;
    const euCentralClient = {
      send: vi
        .fn()
        .mockImplementationOnce(async (command) => {
          expect(command.input.Regions).toEqual(['eu-central-1']);

          return {
            Indexes: [
              {
                Region: 'eu-central-1',
                Type: 'AGGREGATOR',
              },
            ],
          };
        })
        .mockResolvedValueOnce({
          ViewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
        })
        .mockResolvedValueOnce({
          View: {
            Filters: {
              FilterString: '',
            },
            ViewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
          },
        })
        .mockImplementationOnce(async (command) => {
          expect(command.input.Filters?.FilterString).toBe('resourcetype:ec2:volume region:eu-central-1,eu-west-1');
          expect(command.input.MaxResults).toBe(1000);

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
              {
                Arn: 'arn:aws:ec2:eu-west-1:123456789012:volume/vol-456',
                OwningAccountId: '123456789012',
                Region: 'eu-west-1',
                ResourceType: 'ec2:volume',
                Service: 'ec2',
                Properties: [],
              },
            ],
          };
        }),
    } as never;
    const euWestClient = {
      send: vi.fn().mockImplementationOnce(async (command) => {
        expect(command.input.Regions).toEqual(['eu-west-1']);

        return {
          Indexes: [
            {
              Region: 'eu-west-1',
              Type: 'LOCAL',
            },
          ],
        };
      }),
    } as never;

    vi.spyOn(clientModule, 'createResourceExplorerClient').mockImplementation(({ region }) => {
      if (region === 'ap-south-1') {
        return apSouthClient;
      }

      if (region === 'eu-central-1') {
        return euCentralClient;
      }

      if (region === 'eu-west-1') {
        return euWestClient;
      }

      throw new Error(`Unexpected client region ${region}`);
    });

    await expect(
      buildAwsDiscoveryCatalog({ mode: 'regions', regions: ['eu-central-1', 'eu-west-1'] }, ['ec2:volume']),
    ).resolves.toEqual({
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
          arn: 'arn:aws:ec2:eu-west-1:123456789012:volume/vol-456',
          accountId: '123456789012',
          region: 'eu-west-1',
          resourceType: 'ec2:volume',
          service: 'ec2',
          properties: [],
        },
      ],
      searchRegion: 'eu-central-1',
      indexType: 'AGGREGATOR',
      viewArn: 'arn:aws:resource-explorer-2:eu-central-1:123456789012:view/default',
    });
    expect(apSouthClient.send).toHaveBeenCalledTimes(1);
    expect(euWestClient.send).toHaveBeenCalledTimes(1);
    expect(euCentralClient.send).toHaveBeenCalledTimes(4);
  });

  it('fails multi-region discovery when denied regions are skipped and no accessible aggregator exists', async () => {
    vi.spyOn(clientModule, 'listEnabledAwsRegions').mockResolvedValue(['ap-south-1', 'eu-central-1']);

    const apSouthClient = {
      send: vi.fn().mockRejectedValue(
        Object.assign(new Error('explicit deny'), {
          name: 'AccessDeniedException',
          $metadata: {
            httpStatusCode: 403,
          },
        }),
      ),
    } as never;
    const euCentralClient = {
      send: vi.fn().mockImplementationOnce(async (command) => {
        expect(command.input.Regions).toEqual(['eu-central-1']);

        return {
          Indexes: [
            {
              Region: 'eu-central-1',
              Type: 'LOCAL',
            },
          ],
        };
      }),
    } as never;

    vi.spyOn(clientModule, 'createResourceExplorerClient').mockImplementation(({ region }) => {
      if (region === 'ap-south-1') {
        return apSouthClient;
      }

      if (region === 'eu-central-1') {
        return euCentralClient;
      }

      throw new Error(`Unexpected client region ${region}`);
    });

    await expect(
      buildAwsDiscoveryCatalog({ mode: 'regions', regions: ['ap-south-1', 'eu-central-1'] }, ['ec2:volume']),
    ).rejects.toMatchObject({
      code: 'RESOURCE_EXPLORER_AGGREGATOR_REQUIRED',
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

  it('creates a local-only setup when no aggregator region is supplied', async () => {
    const send = vi.fn().mockResolvedValue({
      TaskId: 'task-123',
    });
    vi.spyOn(clientModule, 'createResourceExplorerClient').mockReturnValue({
      send,
    } as never);

    await expect(
      createAwsResourceExplorerSetup({ region: 'eu-central-1', regions: ['eu-central-1'] }),
    ).resolves.toEqual({
      aggregatorRegion: 'eu-central-1',
      indexType: 'local',
      regions: ['eu-central-1'],
      status: 'CREATED',
      taskId: 'task-123',
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          RegionList: ['eu-central-1'],
          ViewName: 'cloudburn-default',
        },
      }),
    );
  });
});
