import type { GetFunctionConfigurationCommand } from '@aws-sdk/client-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLambdaClient } from '../../src/providers/aws/client.js';
import { fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';
import {
  hydrateAwsLambdaFunctionMetrics,
  hydrateAwsLambdaFunctions,
} from '../../src/providers/aws/resources/lambda.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createLambdaClient: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/cloudwatch.js', () => ({
  fetchCloudWatchSignals: vi.fn(),
}));

const mockedCreateLambdaClient = vi.mocked(createLambdaClient);
const mockedFetchCloudWatchSignals = vi.mocked(fetchCloudWatchSignals);

describe('hydrateAwsLambdaFunctions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates discovered functions with region-specific clients and defaults missing architectures to x86_64', async () => {
    const send = vi.fn(async (command: GetFunctionConfigurationCommand) => {
      const input = command.input as { FunctionName?: string };

      if (input.FunctionName?.includes(':first-function')) {
        return {
          Architectures: undefined,
          FunctionName: 'first-function',
        };
      }

      return {
        Architectures: ['arm64'],
        FunctionName: 'second-function',
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
    expect(functions).toEqual([
      {
        accountId: '123456789012',
        architectures: ['x86_64'],
        functionName: 'first-function',
        region: 'us-east-1',
        timeoutSeconds: 3,
      },
      {
        accountId: '123456789012',
        architectures: ['arm64'],
        functionName: 'second-function',
        region: 'us-east-1',
        timeoutSeconds: 3,
      },
    ]);
  });

  it('reuses the cached client for same-region functions while requests are still in flight', async () => {
    const pendingResponses = new Map<string, (value: { Architectures?: string[]; FunctionName?: string }) => void>();
    const send = vi.fn(
      (command: GetFunctionConfigurationCommand) =>
        new Promise<{ Architectures?: string[]; FunctionName?: string }>((resolve) => {
          const input = command.input as { FunctionName?: string };
          pendingResponses.set(input.FunctionName ?? '', resolve);
        }),
    );

    mockedCreateLambdaClient.mockReturnValue({ send } as never);

    const hydration = hydrateAwsLambdaFunctions([
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

    pendingResponses.get('arn:aws:lambda:us-east-1:123456789012:function:first-function')?.({
      Architectures: ['arm64'],
      FunctionName: 'first-function',
    });
    pendingResponses.get('arn:aws:lambda:us-east-1:123456789012:function:second-function')?.({
      Architectures: ['x86_64'],
      FunctionName: 'second-function',
    });

    await expect(hydration).resolves.toEqual([
      {
        accountId: '123456789012',
        architectures: ['arm64'],
        functionName: 'first-function',
        region: 'us-east-1',
        timeoutSeconds: 3,
      },
      {
        accountId: '123456789012',
        architectures: ['x86_64'],
        functionName: 'second-function',
        region: 'us-east-1',
        timeoutSeconds: 3,
      },
    ]);
  });

  it('caps in-flight lambda configuration requests per region', async () => {
    let currentInFlight = 0;
    let maxInFlight = 0;
    const send = vi.fn(
      async (command: GetFunctionConfigurationCommand) =>
        new Promise<{ Architectures?: string[]; FunctionName?: string }>((resolve) => {
          currentInFlight += 1;
          maxInFlight = Math.max(maxInFlight, currentInFlight);

          const input = command.input as { FunctionName?: string };
          const functionName = input.FunctionName?.split(':').at(-1) ?? 'unknown';

          setTimeout(() => {
            currentInFlight -= 1;
            resolve({
              Architectures: ['arm64'],
              FunctionName: functionName,
            });
          }, 0);
        }),
    );

    mockedCreateLambdaClient.mockReturnValue({ send } as never);

    const resources = Array.from({ length: 30 }, (_, index) => ({
      accountId: '123456789012',
      arn: `arn:aws:lambda:us-east-1:123456789012:function:function-${index}`,
      properties: [],
      region: 'us-east-1',
      resourceType: 'lambda:function',
      service: 'lambda',
    }));

    await hydrateAwsLambdaFunctions(resources);

    expect(maxInFlight).toBeLessThanOrEqual(5);
  });

  it('retries throttled lambda configuration lookups before failing', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('Rate exceeded'), {
          name: 'TooManyRequestsException',
          $metadata: {
            httpStatusCode: 429,
            requestId: 'request-789',
          },
        }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error('Rate exceeded'), {
          name: 'TooManyRequestsException',
          $metadata: {
            httpStatusCode: 429,
            requestId: 'request-790',
          },
        }),
      )
      .mockResolvedValueOnce({
        Architectures: ['arm64'],
        FunctionName: 'retry-function',
        Timeout: 15,
      });

    mockedCreateLambdaClient.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsLambdaFunctions([
        {
          accountId: '123456789012',
          arn: 'arn:aws:lambda:eu-central-1:123456789012:function:retry-function',
          properties: [],
          region: 'eu-central-1',
          resourceType: 'lambda:function',
          service: 'lambda',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        architectures: ['arm64'],
        functionName: 'retry-function',
        region: 'eu-central-1',
        timeoutSeconds: 15,
      },
    ]);

    expect(send).toHaveBeenCalledTimes(3);
  });
});

describe('hydrateAwsLambdaFunctionMetrics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates Lambda function metrics from a shared 7-day CloudWatch query set', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Architectures: ['x86_64'],
        FunctionName: 'first-function',
        Timeout: 60,
      })
      .mockResolvedValueOnce({
        Architectures: ['arm64'],
        FunctionName: 'second-function',
        Timeout: 120,
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
      Architectures: ['x86_64'],
      FunctionName: 'quiet-function',
      Timeout: 60,
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
});
