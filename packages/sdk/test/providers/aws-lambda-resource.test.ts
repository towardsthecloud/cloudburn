import { GetLambdaFunctionRecommendationsCommand } from '@aws-sdk/client-compute-optimizer';
import { ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createComputeOptimizerClient, createLambdaClient } from '../../src/providers/aws/client.js';
import { fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';
import {
  hydrateAwsLambdaFunctionMetrics,
  hydrateAwsLambdaFunctions,
  hydrateAwsLambdaMemoryRecommendations,
} from '../../src/providers/aws/resources/lambda.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createComputeOptimizerClient: vi.fn(),
  createLambdaClient: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/cloudwatch.js', () => ({
  fetchCloudWatchSignals: vi.fn(),
}));

const mockedCreateComputeOptimizerClient = vi.mocked(createComputeOptimizerClient);
const mockedCreateLambdaClient = vi.mocked(createLambdaClient);
const mockedFetchCloudWatchSignals = vi.mocked(fetchCloudWatchSignals);

describe('hydrateAwsLambdaFunctions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('paginates listed functions and defaults missing configuration values', async () => {
    const send = vi.fn(async (command: ListFunctionsCommand) => {
      expect(command).toBeInstanceOf(ListFunctionsCommand);

      if (!command.input.Marker) {
        return {
          Functions: [
            {
              Architectures: undefined,
              FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:first-function',
              FunctionName: 'first-function',
            },
          ],
          NextMarker: 'page-2',
        };
      }

      return {
        Functions: [
          {
            Architectures: ['arm64'],
            FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:second-function',
            FunctionName: 'second-function',
            MemorySize: 512,
            Timeout: 60,
          },
          {
            FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:not-selected',
            FunctionName: 'not-selected',
          },
        ],
      };
    });

    mockedCreateLambdaClient.mockReturnValue({ send } as never);

    const functions = await hydrateAwsLambdaFunctions([
      {
        accountId: '123456789012',
        arn: 'arn:aws:lambda:us-east-1:123456789012:function:first-function',
        properties: [],
        region: 'us-east-1',
        resourceType: 'lambda:function',
        service: 'lambda',
      },
      {
        accountId: '123456789012',
        arn: 'arn:aws:lambda:us-east-1:123456789012:function:second-function',
        properties: [],
        region: 'us-east-1',
        resourceType: 'lambda:function',
        service: 'lambda',
      },
    ]);

    expect(mockedCreateLambdaClient).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(functions).toEqual([
      {
        accountId: '123456789012',
        architectures: ['x86_64'],
        functionName: 'first-function',
        memorySizeMb: 128,
        region: 'us-east-1',
        timeoutSeconds: 3,
      },
      {
        accountId: '123456789012',
        architectures: ['arm64'],
        functionName: 'second-function',
        memorySizeMb: 512,
        region: 'us-east-1',
        timeoutSeconds: 60,
      },
    ]);
  });

  it('lists functions with one client per selected region', async () => {
    mockedCreateLambdaClient.mockImplementation(
      ({ region }) =>
        ({
          send: vi.fn().mockResolvedValue({
            Functions: [
              {
                FunctionArn: `arn:aws:lambda:${region}:123456789012:function:${region}-function`,
                FunctionName: `${region}-function`,
              },
            ],
          }),
        }) as never,
    );

    await expect(
      hydrateAwsLambdaFunctions([
        {
          accountId: '123456789012',
          arn: 'arn:aws:lambda:us-east-1:123456789012:function:us-east-1-function',
          properties: [],
          region: 'us-east-1',
          resourceType: 'lambda:function',
          service: 'lambda',
        },
        {
          accountId: '123456789012',
          arn: 'arn:aws:lambda:eu-central-1:123456789012:function:eu-central-1-function',
          properties: [],
          region: 'eu-central-1',
          resourceType: 'lambda:function',
          service: 'lambda',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        architectures: ['x86_64'],
        functionName: 'eu-central-1-function',
        memorySizeMb: 128,
        region: 'eu-central-1',
        timeoutSeconds: 3,
      },
      {
        accountId: '123456789012',
        architectures: ['x86_64'],
        functionName: 'us-east-1-function',
        memorySizeMb: 128,
        region: 'us-east-1',
        timeoutSeconds: 3,
      },
    ]);
    expect(mockedCreateLambdaClient).toHaveBeenCalledTimes(2);
    expect(mockedCreateLambdaClient).toHaveBeenCalledWith({ region: 'eu-central-1' });
    expect(mockedCreateLambdaClient).toHaveBeenCalledWith({ region: 'us-east-1' });
  });

  it('retries a throttled later page without duplicating earlier functions', async () => {
    let secondPageAttempts = 0;
    const send = vi.fn(async (command: ListFunctionsCommand) => {
      if (!command.input.Marker) {
        return {
          Functions: [
            {
              FunctionArn: 'arn:aws:lambda:eu-central-1:123456789012:function:first-function',
              FunctionName: 'first-function',
            },
          ],
          NextMarker: 'page-2',
        };
      }

      secondPageAttempts += 1;
      if (secondPageAttempts === 1) {
        throw Object.assign(new Error('Rate exceeded'), {
          name: 'TooManyRequestsException',
          $metadata: {
            httpStatusCode: 429,
            requestId: 'request-789',
          },
        });
      }

      return {
        Functions: [
          {
            Architectures: ['arm64'],
            FunctionArn: 'arn:aws:lambda:eu-central-1:123456789012:function:second-function',
            FunctionName: 'second-function',
            Timeout: 15,
          },
        ],
      };
    });

    mockedCreateLambdaClient.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsLambdaFunctions([
        {
          accountId: '123456789012',
          arn: 'arn:aws:lambda:eu-central-1:123456789012:function:first-function',
          properties: [],
          region: 'eu-central-1',
          resourceType: 'lambda:function',
          service: 'lambda',
        },
        {
          accountId: '123456789012',
          arn: 'arn:aws:lambda:eu-central-1:123456789012:function:second-function',
          properties: [],
          region: 'eu-central-1',
          resourceType: 'lambda:function',
          service: 'lambda',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        architectures: ['x86_64'],
        functionName: 'first-function',
        memorySizeMb: 128,
        region: 'eu-central-1',
        timeoutSeconds: 3,
      },
      {
        accountId: '123456789012',
        architectures: ['arm64'],
        functionName: 'second-function',
        memorySizeMb: 128,
        region: 'eu-central-1',
        timeoutSeconds: 15,
      },
    ]);

    expect(send).toHaveBeenCalledTimes(3);
  });
});

describe('hydrateAwsLambdaMemoryRecommendations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('paginates Compute Optimizer memory-overprovisioning recommendations for selected functions', async () => {
    const selectedFunctionArn = 'arn:aws:lambda:us-east-1:123456789012:function:selected';
    const send = vi.fn(async (command: GetLambdaFunctionRecommendationsCommand) => {
      expect(command).toBeInstanceOf(GetLambdaFunctionRecommendationsCommand);
      expect(command.input.filters).toEqual([
        {
          name: 'FindingReasonCode',
          values: ['MemoryOverprovisioned'],
        },
      ]);

      if (!command.input.nextToken) {
        return {
          lambdaFunctionRecommendations: [
            {
              accountId: '123456789012',
              currentMemorySize: 512,
              findingReasonCodes: ['MemoryOverprovisioned'],
              functionArn: `${selectedFunctionArn}:$LATEST`,
              lastRefreshTimestamp: new Date('2026-03-23T00:00:00.000Z'),
              memorySizeRecommendationOptions: [
                {
                  memorySize: 256,
                  rank: 1,
                  savingsOpportunity: {
                    estimatedMonthlySavings: { currency: 'USD', value: 4.25 },
                    savingsOpportunityPercentage: 32,
                  },
                },
              ],
            },
          ],
          nextToken: 'page-2',
        };
      }

      return {
        lambdaFunctionRecommendations: [
          {
            accountId: '123456789012',
            currentMemorySize: 1024,
            findingReasonCodes: ['MemoryOverprovisioned'],
            functionArn: 'arn:aws:lambda:us-east-1:123456789012:function:not-selected',
          },
        ],
      };
    });
    mockedCreateComputeOptimizerClient.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsLambdaMemoryRecommendations([
        {
          accountId: '123456789012',
          arn: selectedFunctionArn,
          properties: [],
          region: 'us-east-1',
          resourceType: 'lambda:function',
          service: 'lambda',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        functionArn: selectedFunctionArn,
        region: 'us-east-1',
      },
    ]);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('hydrateAwsLambdaFunctionMetrics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates Lambda function metrics from a shared 7-day CloudWatch query set', async () => {
    const send = vi.fn().mockResolvedValue({
      Functions: [
        {
          Architectures: ['x86_64'],
          FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:first-function',
          FunctionName: 'first-function',
          Timeout: 60,
        },
        {
          Architectures: ['arm64'],
          FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:second-function',
          FunctionName: 'second-function',
          Timeout: 120,
        },
      ],
    });

    mockedCreateLambdaClient.mockReturnValue({ send } as never);
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        [
          'invocations0',
          [
            {
              timestamp: '2026-03-24T00:00:00.000Z',
              value: 100,
            },
          ],
        ],
        [
          'errors0',
          [
            {
              timestamp: '2026-03-24T00:00:00.000Z',
              value: 12,
            },
          ],
        ],
        [
          'duration0',
          [
            {
              timestamp: '2026-03-24T00:00:00.000Z',
              value: 2_500,
            },
          ],
        ],
        [
          'invocations1',
          [
            {
              timestamp: '2026-03-24T00:00:00.000Z',
              value: 80,
            },
          ],
        ],
        [
          'duration1',
          [
            {
              timestamp: '2026-03-24T00:00:00.000Z',
              value: 8_000,
            },
          ],
        ],
      ]),
    );

    const metrics = await hydrateAwsLambdaFunctionMetrics([
      {
        accountId: '123456789012',
        arn: 'arn:aws:lambda:us-east-1:123456789012:function:first-function',
        properties: [],
        region: 'us-east-1',
        resourceType: 'lambda:function',
        service: 'lambda',
      },
      {
        accountId: '123456789012',
        arn: 'arn:aws:lambda:us-east-1:123456789012:function:second-function',
        properties: [],
        region: 'us-east-1',
        resourceType: 'lambda:function',
        service: 'lambda',
      },
    ]);

    expect(mockedFetchCloudWatchSignals).toHaveBeenCalledTimes(1);
    expect(metrics).toEqual([
      {
        accountId: '123456789012',
        averageDurationMsLast7Days: 2_500,
        functionName: 'first-function',
        region: 'us-east-1',
        totalErrorsLast7Days: 12,
        totalInvocationsLast7Days: 100,
      },
      {
        accountId: '123456789012',
        averageDurationMsLast7Days: 8_000,
        functionName: 'second-function',
        region: 'us-east-1',
        totalErrorsLast7Days: 0,
        totalInvocationsLast7Days: 80,
      },
    ]);
  });

  it('preserves unknown metric coverage when Lambda emitted no invocation datapoints', async () => {
    const send = vi.fn().mockResolvedValue({
      Functions: [
        {
          Architectures: ['x86_64'],
          FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:quiet-function',
          FunctionName: 'quiet-function',
          Timeout: 60,
        },
      ],
    });

    mockedCreateLambdaClient.mockReturnValue({ send } as never);
    mockedFetchCloudWatchSignals.mockResolvedValue(new Map());

    await expect(
      hydrateAwsLambdaFunctionMetrics([
        {
          accountId: '123456789012',
          arn: 'arn:aws:lambda:us-east-1:123456789012:function:quiet-function',
          properties: [],
          region: 'us-east-1',
          resourceType: 'lambda:function',
          service: 'lambda',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        averageDurationMsLast7Days: null,
        functionName: 'quiet-function',
        region: 'us-east-1',
        totalErrorsLast7Days: null,
        totalInvocationsLast7Days: null,
      },
    ]);
  });

  it('reuses the shared lambda dataset when a discovery context provides preloaded functions', async () => {
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        ['invocations0', [{ timestamp: '2026-03-24T00:00:00.000Z', value: 100 }]],
        ['errors0', [{ timestamp: '2026-03-24T00:00:00.000Z', value: 12 }]],
        ['duration0', [{ timestamp: '2026-03-24T00:00:00.000Z', value: 2_500 }]],
      ]),
    );

    await expect(
      hydrateAwsLambdaFunctionMetrics([], {
        loadDataset: async () => [
          {
            accountId: '123456789012',
            architectures: ['x86_64'],
            functionName: 'shared-function',
            memorySizeMb: 512,
            region: 'us-east-1',
            timeoutSeconds: 60,
          },
        ],
      }),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        averageDurationMsLast7Days: 2_500,
        functionName: 'shared-function',
        region: 'us-east-1',
        totalErrorsLast7Days: 12,
        totalInvocationsLast7Days: 100,
      },
    ]);

    expect(mockedCreateLambdaClient).not.toHaveBeenCalled();
  });
});
