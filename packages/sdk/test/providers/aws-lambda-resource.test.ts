import { paginateListFunctions } from '@aws-sdk/client-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLambdaClient } from '../../src/providers/aws/client.js';
import { discoverAwsLambdaFunctions } from '../../src/providers/aws/resources/lambda.js';

vi.mock('@aws-sdk/client-lambda', () => ({
  paginateListFunctions: vi.fn(),
}));

vi.mock('../../src/providers/aws/client.js', () => ({
  createLambdaClient: vi.fn(),
}));

const mockedPaginateListFunctions = vi.mocked(paginateListFunctions);
const mockedCreateLambdaClient = vi.mocked(createLambdaClient);

const createAsyncIterable = <T>(pages: T[]): AsyncIterable<T> => ({
  async *[Symbol.asyncIterator]() {
    for (const page of pages) {
      yield page;
    }
  },
});

const createRejectedAsyncIterable = <T>(error: Error): AsyncIterable<T> => ({
  // biome-ignore lint/correctness/useYield: intentionally throws before yielding to simulate API failure
  async *[Symbol.asyncIterator]() {
    throw error;
  },
});

describe('discoverAwsLambdaFunctions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('paginates functions across regions, skips unnamed functions, and defaults missing architectures to x86_64', async () => {
    mockedCreateLambdaClient.mockImplementation(({ region }) => ({ region }) as never);
    mockedPaginateListFunctions.mockImplementation(({ client }) => {
      const region = (client as { region: string }).region;

      if (region === 'us-east-1') {
        return createAsyncIterable([
          {
            Functions: [
              { FunctionName: 'arm-function', Architectures: ['arm64'] },
              { FunctionName: 'default-function' },
              { Architectures: ['x86_64'] },
            ],
          },
          {
            Functions: [{ FunctionName: 'x86-function', Architectures: ['x86_64'] }],
          },
        ]);
      }

      return createAsyncIterable([
        {
          Functions: [{ FunctionName: 'west-function', Architectures: ['arm64'] }],
        },
      ]);
    });

    const functions = await discoverAwsLambdaFunctions(['us-east-1', 'us-west-2'], '123456789012');

    expect(mockedCreateLambdaClient).toHaveBeenCalledTimes(2);
    expect(functions).toEqual([
      {
        functionName: 'arm-function',
        architectures: ['arm64'],
        region: 'us-east-1',
        accountId: '123456789012',
      },
      {
        functionName: 'default-function',
        architectures: ['x86_64'],
        region: 'us-east-1',
        accountId: '123456789012',
      },
      {
        functionName: 'x86-function',
        architectures: ['x86_64'],
        region: 'us-east-1',
        accountId: '123456789012',
      },
      {
        functionName: 'west-function',
        architectures: ['arm64'],
        region: 'us-west-2',
        accountId: '123456789012',
      },
    ]);
  });

  it('returns partial results when one region fails to list functions', async () => {
    mockedCreateLambdaClient.mockImplementation(({ region }) => ({ region }) as never);
    mockedPaginateListFunctions.mockImplementation(({ client }) => {
      const region = (client as { region: string }).region;

      if (region === 'us-east-1') {
        return createAsyncIterable([
          {
            Functions: [{ FunctionName: 'east-function', Architectures: ['x86_64'] }],
          },
        ]);
      }

      return createRejectedAsyncIterable(new Error('AccessDeniedException'));
    });

    await expect(discoverAwsLambdaFunctions(['us-east-1', 'us-west-2'], '123456789012')).resolves.toEqual([
      {
        functionName: 'east-function',
        architectures: ['x86_64'],
        region: 'us-east-1',
        accountId: '123456789012',
      },
    ]);
  });
});
