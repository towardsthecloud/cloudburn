import type {
  DescribeEndpointCommand,
  DescribeEndpointConfigCommand,
  DescribeNotebookInstanceCommand,
} from '@aws-sdk/client-sagemaker';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSageMakerClient } from '../../src/providers/aws/client.js';
import { fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';
import {
  hydrateAwsSageMakerEndpointActivity,
  hydrateAwsSageMakerNotebookInstances,
} from '../../src/providers/aws/resources/sagemaker.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createSageMakerClient: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/cloudwatch.js', () => ({
  fetchCloudWatchSignals: vi.fn(),
}));

const mockedCreateSageMakerClient = vi.mocked(createSageMakerClient);
const mockedFetchCloudWatchSignals = vi.mocked(fetchCloudWatchSignals);

describe('hydrateAwsSageMakerNotebookInstances', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates discovered notebook instances with status, type, and last modified time', async () => {
    mockedCreateSageMakerClient.mockReturnValue({
      send: vi.fn(async (_command: DescribeNotebookInstanceCommand) => ({
        InstanceType: 'ml.t3.medium',
        LastModifiedTime: new Date('2026-03-01T00:00:00.000Z'),
        NotebookInstanceName: 'analytics-notebook',
        NotebookInstanceStatus: 'InService',
      })),
    } as never);

    await expect(
      hydrateAwsSageMakerNotebookInstances([
        {
          accountId: '123456789012',
          arn: 'arn:aws:sagemaker:eu-west-1:123456789012:notebook-instance/analytics-notebook',
          properties: [],
          region: 'eu-west-1',
          resourceType: 'sagemaker:notebook-instance',
          service: 'sagemaker',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        instanceType: 'ml.t3.medium',
        lastModifiedTime: '2026-03-01T00:00:00.000Z',
        notebookInstanceName: 'analytics-notebook',
        notebookInstanceStatus: 'InService',
        region: 'eu-west-1',
      },
    ]);
  });

  it('skips notebook instances that disappear before hydration completes', async () => {
    const error = new Error("Could not find notebook instance 'analytics-notebook'.");
    error.name = 'ValidationException';

    mockedCreateSageMakerClient.mockReturnValue({
      send: vi.fn(async (_command: DescribeNotebookInstanceCommand) => {
        throw error;
      }),
    } as never);

    await expect(
      hydrateAwsSageMakerNotebookInstances([
        {
          accountId: '123456789012',
          arn: 'arn:aws:sagemaker:eu-west-1:123456789012:notebook-instance/analytics-notebook',
          properties: [],
          region: 'eu-west-1',
          resourceType: 'sagemaker:notebook-instance',
          service: 'sagemaker',
        },
      ]),
    ).resolves.toEqual([]);
  });

  it('hydrates SageMaker endpoints with 14-day invocation totals across variants', async () => {
    mockedCreateSageMakerClient.mockReturnValue({
      send: vi.fn(async (command: DescribeEndpointCommand | DescribeEndpointConfigCommand) => {
        const input = command.input as { EndpointConfigName?: string; EndpointName?: string };

        if (input.EndpointName) {
          return {
            CreationTime: new Date('2025-12-01T00:00:00.000Z'),
            EndpointArn: 'arn:aws:sagemaker:eu-west-1:123456789012:endpoint/orders-endpoint',
            EndpointConfigName: 'orders-endpoint-config',
            EndpointName: 'orders-endpoint',
            EndpointStatus: 'InService',
            LastModifiedTime: new Date('2025-12-15T00:00:00.000Z'),
          };
        }

        return {
          ProductionVariants: [{ VariantName: 'blue' }, { VariantName: 'green' }],
        };
      }),
    } as never);
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        [
          'endpoint0variant0',
          Array.from({ length: 14 }, (_value, index) => ({
            timestamp: `2025-12-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
            value: 0,
          })),
        ],
        [
          'endpoint0variant1',
          Array.from({ length: 14 }, (_value, index) => ({
            timestamp: `2025-12-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
            value: 1,
          })),
        ],
      ]),
    );

    await expect(
      hydrateAwsSageMakerEndpointActivity([
        {
          accountId: '123456789012',
          arn: 'arn:aws:sagemaker:eu-west-1:123456789012:endpoint/orders-endpoint',
          properties: [],
          region: 'eu-west-1',
          resourceType: 'sagemaker:endpoint',
          service: 'sagemaker',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        creationTime: '2025-12-01T00:00:00.000Z',
        endpointArn: 'arn:aws:sagemaker:eu-west-1:123456789012:endpoint/orders-endpoint',
        endpointConfigName: 'orders-endpoint-config',
        endpointName: 'orders-endpoint',
        endpointStatus: 'InService',
        lastModifiedTime: '2025-12-15T00:00:00.000Z',
        region: 'eu-west-1',
        totalInvocationsLast14Days: 14,
      },
    ]);
  });

  it('preserves null invocation totals when endpoint metrics are incomplete', async () => {
    mockedCreateSageMakerClient.mockReturnValue({
      send: vi.fn(async (command: DescribeEndpointCommand | DescribeEndpointConfigCommand) => {
        const input = command.input as { EndpointConfigName?: string; EndpointName?: string };

        if (input.EndpointName) {
          return {
            CreationTime: new Date('2025-12-01T00:00:00.000Z'),
            EndpointArn: 'arn:aws:sagemaker:eu-west-1:123456789012:endpoint/orders-endpoint',
            EndpointConfigName: 'orders-endpoint-config',
            EndpointName: 'orders-endpoint',
            EndpointStatus: 'InService',
            LastModifiedTime: new Date('2025-12-15T00:00:00.000Z'),
          };
        }

        return {
          ProductionVariants: [{ VariantName: 'blue' }],
        };
      }),
    } as never);
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        [
          'endpoint0variant0',
          [
            {
              timestamp: '2025-12-01T00:00:00.000Z',
              value: 0,
            },
          ],
        ],
      ]),
    );

    await expect(
      hydrateAwsSageMakerEndpointActivity([
        {
          accountId: '123456789012',
          arn: 'arn:aws:sagemaker:eu-west-1:123456789012:endpoint/orders-endpoint',
          properties: [],
          region: 'eu-west-1',
          resourceType: 'sagemaker:endpoint',
          service: 'sagemaker',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        creationTime: '2025-12-01T00:00:00.000Z',
        endpointArn: 'arn:aws:sagemaker:eu-west-1:123456789012:endpoint/orders-endpoint',
        endpointConfigName: 'orders-endpoint-config',
        endpointName: 'orders-endpoint',
        endpointStatus: 'InService',
        lastModifiedTime: '2025-12-15T00:00:00.000Z',
        region: 'eu-west-1',
        totalInvocationsLast14Days: null,
      },
    ]);
  });

  it('treats empty invocation series as zero total for idle endpoints', async () => {
    mockedCreateSageMakerClient.mockReturnValue({
      send: vi.fn(async (command: DescribeEndpointCommand | DescribeEndpointConfigCommand) => {
        const input = command.input as { EndpointConfigName?: string; EndpointName?: string };

        if (input.EndpointName) {
          return {
            CreationTime: new Date('2025-12-01T00:00:00.000Z'),
            EndpointArn: 'arn:aws:sagemaker:eu-west-1:123456789012:endpoint/orders-endpoint',
            EndpointConfigName: 'orders-endpoint-config',
            EndpointName: 'orders-endpoint',
            EndpointStatus: 'InService',
            LastModifiedTime: new Date('2025-12-15T00:00:00.000Z'),
          };
        }

        return {
          ProductionVariants: [{ VariantName: 'blue' }],
        };
      }),
    } as never);
    mockedFetchCloudWatchSignals.mockResolvedValue(new Map([['endpoint0variant0', []]]));

    await expect(
      hydrateAwsSageMakerEndpointActivity([
        {
          accountId: '123456789012',
          arn: 'arn:aws:sagemaker:eu-west-1:123456789012:endpoint/orders-endpoint',
          properties: [],
          region: 'eu-west-1',
          resourceType: 'sagemaker:endpoint',
          service: 'sagemaker',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        creationTime: '2025-12-01T00:00:00.000Z',
        endpointArn: 'arn:aws:sagemaker:eu-west-1:123456789012:endpoint/orders-endpoint',
        endpointConfigName: 'orders-endpoint-config',
        endpointName: 'orders-endpoint',
        endpointStatus: 'InService',
        lastModifiedTime: '2025-12-15T00:00:00.000Z',
        region: 'eu-west-1',
        totalInvocationsLast14Days: 0,
      },
    ]);
  });

  it('skips endpoints whose endpoint configuration was deleted', async () => {
    const missingEndpointConfig = new Error('ValidationException: Could not find the endpoint configuration.');
    missingEndpointConfig.name = 'ValidationException';

    mockedCreateSageMakerClient.mockReturnValue({
      send: vi.fn(async (command: DescribeEndpointCommand | DescribeEndpointConfigCommand) => {
        const input = command.input as { EndpointConfigName?: string; EndpointName?: string };

        if (input.EndpointName) {
          return {
            CreationTime: new Date('2025-12-01T00:00:00.000Z'),
            EndpointArn: 'arn:aws:sagemaker:eu-west-1:123456789012:endpoint/orders-endpoint',
            EndpointConfigName: 'orders-endpoint-config',
            EndpointName: 'orders-endpoint',
            EndpointStatus: 'InService',
            LastModifiedTime: new Date('2025-12-15T00:00:00.000Z'),
          };
        }

        throw missingEndpointConfig;
      }),
    } as never);

    await expect(
      hydrateAwsSageMakerEndpointActivity([
        {
          accountId: '123456789012',
          arn: 'arn:aws:sagemaker:eu-west-1:123456789012:endpoint/orders-endpoint',
          properties: [],
          region: 'eu-west-1',
          resourceType: 'sagemaker:endpoint',
          service: 'sagemaker',
        },
      ]),
    ).resolves.toEqual([]);
  });
});
