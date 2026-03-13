import type { GetFunctionConfigurationCommand } from '@aws-sdk/client-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLambdaClient } from '../../src/providers/aws/client.js';
import { hydrateAwsLambdaFunctions } from '../../src/providers/aws/resources/lambda.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createLambdaClient: vi.fn(),
}));

const mockedCreateLambdaClient = vi.mocked(createLambdaClient);

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
      },
      {
        accountId: '123456789012',
        architectures: ['arm64'],
        functionName: 'second-function',
        region: 'us-east-1',
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
      },
      {
        accountId: '123456789012',
        architectures: ['x86_64'],
        functionName: 'second-function',
        region: 'us-east-1',
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
      },
    ]);

    expect(send).toHaveBeenCalledTimes(3);
  });
});
