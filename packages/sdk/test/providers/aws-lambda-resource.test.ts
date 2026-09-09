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
import { completeMetricEvidence } from '../helpers/cloudwatch.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createComputeOptimizerClient: vi.fn(),
  createLambdaClient: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/cloudwatch.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/aws/resources/cloudwatch.js')>()),
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
        functionArn: 'arn:aws:lambda:us-east-1:123456789012:function:first-function',
        functionName: 'first-function',
        memorySizeMb: 128,
        region: 'us-east-1',
        timeoutSeconds: 3,
      },
      {
        accountId: '123456789012',
        architectures: ['arm64'],
        functionArn: 'arn:aws:lambda:us-east-1:123456789012:function:second-function',
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
        functionArn: 'arn:aws:lambda:eu-central-1:123456789012:function:eu-central-1-function',
        functionName: 'eu-central-1-function',
        memorySizeMb: 128,
        region: 'eu-central-1',
        timeoutSeconds: 3,
      },
      {
        accountId: '123456789012',
        architectures: ['x86_64'],
        functionArn: 'arn:aws:lambda:us-east-1:123456789012:function:us-east-1-function',
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
        functionArn: 'arn:aws:lambda:eu-central-1:123456789012:function:first-function',
        functionName: 'first-function',
        memorySizeMb: 128,
        region: 'eu-central-1',
        timeoutSeconds: 3,
      },
      {
        accountId: '123456789012',
        architectures: ['arm64'],
        functionArn: 'arn:aws:lambda:eu-central-1:123456789012:function:second-function',
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

  const selectedResource = (functionName: string) => ({
    accountId: '123456789012',
    arn: `arn:aws:lambda:us-east-1:123456789012:function:${functionName}`,
    properties: [],
    region: 'us-east-1',
    resourceType: 'lambda:function',
    service: 'lambda',
  });

  it('pages every finding class in the Region and normalizes memory assessments for selected functions', async () => {
    const send = vi.fn(async (command: GetLambdaFunctionRecommendationsCommand) => {
      expect(command).toBeInstanceOf(GetLambdaFunctionRecommendationsCommand);
      expect(command.input.filters).toEqual([
        { name: 'Finding', values: ['Optimized', 'NotOptimized', 'Unavailable'] },
      ]);
      // Unqualified functionArns would return only $LATEST and hide published versions.
      expect(command.input.functionArns).toBeUndefined();

      if (!command.input.nextToken) {
        return {
          lambdaFunctionRecommendations: [
            {
              accountId: '123456789012',
              currentMemorySize: 512,
              finding: 'NotOptimized',
              findingReasonCodes: ['MemoryOverprovisioned'],
              functionArn: 'arn:aws:lambda:us-east-1:123456789012:function:overprovisioned:$LATEST',
              memorySizeRecommendationOptions: [{ memorySize: 256, rank: 1 }],
            },
            {
              accountId: '123456789012',
              finding: 'Optimized',
              functionArn: 'arn:aws:lambda:us-east-1:123456789012:function:optimized',
            },
            {
              accountId: '123456789012',
              finding: 'NotOptimized',
              findingReasonCodes: ['MemoryUnderprovisioned'],
              functionArn: 'arn:aws:lambda:us-east-1:123456789012:function:underprovisioned',
            },
          ],
          nextToken: 'page-2',
        };
      }

      return {
        lambdaFunctionRecommendations: [
          {
            accountId: '123456789012',
            finding: 'Unavailable',
            findingReasonCodes: ['InsufficientData'],
            functionArn: 'arn:aws:lambda:us-east-1:123456789012:function:insufficient-data',
          },
          {
            accountId: '123456789012',
            finding: 'NotOptimized',
            findingReasonCodes: ['MemoryOverprovisioned'],
            functionArn: 'arn:aws:lambda:us-east-1:123456789012:function:not-selected',
          },
        ],
      };
    });
    mockedCreateComputeOptimizerClient.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsLambdaMemoryRecommendations(
        ['overprovisioned', 'optimized', 'underprovisioned', 'insufficient-data', 'pending'].map(selectedResource),
      ),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        assessment: 'unavailable',
        functionArn: 'arn:aws:lambda:us-east-1:123456789012:function:insufficient-data',
        region: 'us-east-1',
      },
      {
        accountId: '123456789012',
        assessment: 'not_overprovisioned',
        functionArn: 'arn:aws:lambda:us-east-1:123456789012:function:optimized',
        region: 'us-east-1',
      },
      {
        accountId: '123456789012',
        assessment: 'memory_overprovisioned',
        functionArn: 'arn:aws:lambda:us-east-1:123456789012:function:overprovisioned',
        region: 'us-east-1',
      },
      {
        accountId: '123456789012',
        assessment: 'not_overprovisioned',
        functionArn: 'arn:aws:lambda:us-east-1:123456789012:function:underprovisioned',
        region: 'us-east-1',
      },
    ]);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('keeps the strongest assessment when several function versions share one unqualified ARN', async () => {
    const functionArn = 'arn:aws:lambda:us-east-1:123456789012:function:versioned';
    const send = vi.fn(async () => ({
      lambdaFunctionRecommendations: [
        { accountId: '123456789012', finding: 'Unavailable', functionArn: `${functionArn}:1` },
        {
          accountId: '123456789012',
          finding: 'NotOptimized',
          findingReasonCodes: ['MemoryOverprovisioned'],
          functionArn: `${functionArn}:2`,
        },
        { accountId: '123456789012', finding: 'Optimized', functionArn: `${functionArn}:$LATEST` },
      ],
    }));
    mockedCreateComputeOptimizerClient.mockReturnValue({ send } as never);

    await expect(hydrateAwsLambdaMemoryRecommendations([selectedResource('versioned')])).resolves.toEqual([
      { accountId: '123456789012', assessment: 'memory_overprovisioned', functionArn, region: 'us-east-1' },
    ]);
  });

  it('returns no assessments when Compute Optimizer has not analyzed any selected function', async () => {
    const send = vi.fn(async () => ({ lambdaFunctionRecommendations: [] }));
    mockedCreateComputeOptimizerClient.mockReturnValue({ send } as never);

    await expect(hydrateAwsLambdaMemoryRecommendations([selectedResource('pending')])).resolves.toEqual([]);
  });

  it('preserves Compute Optimizer context when the account is not enrolled', async () => {
    const send = vi.fn(async () => {
      throw Object.assign(new Error('The account is not opted in to AWS Compute Optimizer.'), {
        name: 'OptInRequiredException',
        $metadata: { requestId: 'request-1' },
      });
    });
    mockedCreateComputeOptimizerClient.mockReturnValue({ send } as never);

    await expect(hydrateAwsLambdaMemoryRecommendations([selectedResource('pending')])).rejects.toThrow(
      /AWS Compute Optimizer GetLambdaFunctionRecommendations/,
    );
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
        ['durationCount0', completeMetricEvidence([{ timestamp: '2026-03-24T00:00:00.000Z', value: 1 }])],
        ['durationCount1', completeMetricEvidence([{ timestamp: '2026-03-24T00:00:00.000Z', value: 1 }])],
        [
          'invocations0',
          completeMetricEvidence([
            {
              timestamp: '2026-03-24T00:00:00.000Z',
              value: 100,
            },
          ]),
        ],
        [
          'errors0',
          completeMetricEvidence([
            {
              timestamp: '2026-03-24T00:00:00.000Z',
              value: 12,
            },
          ]),
        ],
        [
          'durationSum0',
          completeMetricEvidence([
            {
              timestamp: '2026-03-24T00:00:00.000Z',
              value: 2_500,
            },
          ]),
        ],
        [
          'invocations1',
          completeMetricEvidence([
            {
              timestamp: '2026-03-24T00:00:00.000Z',
              value: 80,
            },
          ]),
        ],
        [
          'durationSum1',
          completeMetricEvidence([
            {
              timestamp: '2026-03-24T00:00:00.000Z',
              value: 8_000,
            },
          ]),
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
        totalErrorsLast7Days: null,
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
        ['durationCount0', completeMetricEvidence([{ timestamp: '2026-03-24T00:00:00.000Z', value: 1 }])],
        ['durationCount1', completeMetricEvidence([{ timestamp: '2026-03-24T00:00:00.000Z', value: 1 }])],
        ['invocations0', completeMetricEvidence([{ timestamp: '2026-03-24T00:00:00.000Z', value: 100 }])],
        ['errors0', completeMetricEvidence([{ timestamp: '2026-03-24T00:00:00.000Z', value: 12 }])],
        ['durationSum0', completeMetricEvidence([{ timestamp: '2026-03-24T00:00:00.000Z', value: 2_500 }])],
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
