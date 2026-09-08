import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { HttpRequest } from '@aws-sdk/types';
import { afterEach, expect, it, vi } from 'vitest';
import { getAwsClient, withAwsDiscoveryExecution } from '../../src/providers/aws/execution.js';
import {
  type AwsRequestAttemptTelemetry,
  runAwsRequest,
  withAwsServiceCallBudget,
} from '../../src/providers/aws/request.js';
import { createMemoryAwsRequestStore } from '../../src/providers/aws/request-store.js';

const credentials = { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' };
const response = (statusCode = 200) => ({
  response: {
    statusCode,
    headers: { 'content-type': 'application/x-amz-json-1.0' },
    body: Buffer.from(JSON.stringify(statusCode === 200 ? {} : { __type: 'InternalServerError' })),
  },
});
const preparationError = () => Object.assign(new Error('Synthetic credential timeout'), { name: 'TimeoutError' });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('retries credential failures without spending shared retry capacity or slowing a healthy scan', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const firstFailure = Promise.withResolvers<void>();
  const physical: Array<{ table: string; at: number }> = [];
  const attempts: AwsRequestAttemptTelemetry[] = [];
  let preparations = 0;
  const handle = async (request: HttpRequest) => {
    physical.push({ table: JSON.parse(String(request.body)).TableName, at: Date.now() });
    return response();
  };
  const unstable = getAwsClient(
    'preparation-unstable',
    () =>
      new DynamoDBClient({
        region: 'eu-west-1',
        credentials: async () => {
          if (preparations < 4) throw preparationError();
          return credentials;
        },
        requestHandler: { handle },
      }),
  );
  const healthy = getAwsClient(
    'preparation-healthy',
    () => new DynamoDBClient({ region: 'eu-west-1', credentials, requestHandler: { handle } }),
  );
  const budget = {
    accountId: 'preparation-account',
    store: createMemoryAwsRequestStore(),
    overrides: { 'dynamodb:control-plane-read': { ratePerSecond: 1000, burst: 1000, retryCapacity: 0 } },
    onAttempt: (event: AwsRequestAttemptTelemetry) => attempts.push(event),
  };
  const scan = withAwsDiscoveryExecution({}, async () => {
    const pending = withAwsServiceCallBudget(
      () =>
        runAwsRequest(
          'DynamoDB',
          'DescribeTable',
          'eu-west-1',
          () => {
            preparations += 1;
            return unstable.send(new DescribeTableCommand({ TableName: 'unstable' }));
          },
          { maxAttempts: 4, initialDelayMs: 100, onRetry: () => firstFailure.resolve() },
        ),
      budget,
    );
    const result = Promise.allSettled([pending]);
    await firstFailure.promise;
    await withAwsServiceCallBudget(
      () =>
        runAwsRequest('DynamoDB', 'DescribeTable', 'eu-west-1', () =>
          healthy.send(new DescribeTableCommand({ TableName: 'healthy' })),
        ),
      budget,
    );
    return result;
  });
  const completed = scan.catch((error) => error);
  try {
    await firstFailure.promise;
    await vi.runAllTimersAsync();
    expect(await completed).toEqual([expect.objectContaining({ status: 'fulfilled' })]);
    expect(preparations).toBe(4);
    expect(physical).toEqual([
      { table: 'healthy', at: 0 },
      { table: 'unstable', at: 700 },
    ]);
    expect(attempts.filter((event) => !event.dispatched)).toHaveLength(3);
    expect(attempts.every((event) => event.retryOutcome !== 'exhausted')).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    unstable.destroy();
    healthy.destroy();
  }
});

it('returns a reserved retry unit when preparation fails between physical attempts', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.spyOn(Math, 'random').mockReturnValue(0);
  let preparations = 0;
  const physical: number[] = [];
  const attempts: AwsRequestAttemptTelemetry[] = [];
  const client = getAwsClient(
    'preparation-between-transports',
    () =>
      new DynamoDBClient({
        region: 'eu-west-1',
        credentials,
        requestHandler: {
          handle: async () => {
            physical.push(Date.now());
            return response(physical.length === 1 ? 503 : 200);
          },
        },
      }),
  );
  client.middlewareStack.add(
    (next) => async (args) => {
      if (preparations === 2) throw preparationError();
      return next(args);
    },
    { step: 'build', name: 'syntheticPreparationFailure' },
  );
  const scan = withAwsDiscoveryExecution({}, () =>
    withAwsServiceCallBudget(
      () =>
        runAwsRequest(
          'DynamoDB',
          'DescribeTable',
          'eu-west-1',
          () => {
            preparations += 1;
            return client.send(new DescribeTableCommand({ TableName: 'synthetic' }));
          },
          { maxAttempts: 3, initialDelayMs: 100 },
        ),
      {
        accountId: 'preparation-account',
        store: createMemoryAwsRequestStore(),
        overrides: { 'dynamodb:control-plane-read': { ratePerSecond: 1000, burst: 1000, retryCapacity: 1 } },
        onAttempt: (event) => attempts.push(event),
      },
    ),
  );
  const completed = Promise.allSettled([scan]);
  try {
    await vi.advanceTimersByTimeAsync(0);
    await vi.runAllTimersAsync();
    expect(await completed).toEqual([expect.objectContaining({ status: 'fulfilled' })]);
    expect(preparations).toBe(3);
    expect(physical).toEqual([0, 700]);
    expect(attempts.map((event) => event.dispatched)).toEqual([true, false, true]);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    client.destroy();
  }
});
