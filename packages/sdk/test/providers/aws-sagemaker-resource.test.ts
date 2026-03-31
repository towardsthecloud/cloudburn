import type { DescribeNotebookInstanceCommand } from '@aws-sdk/client-sagemaker';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSageMakerClient } from '../../src/providers/aws/client.js';
import { hydrateAwsSageMakerNotebookInstances } from '../../src/providers/aws/resources/sagemaker.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createSageMakerClient: vi.fn(),
}));

const mockedCreateSageMakerClient = vi.mocked(createSageMakerClient);

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
});
