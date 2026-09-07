import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { afterEach, expect, it, vi } from 'vitest';
import {
  emitAwsRequestTelemetry,
  getAwsClient,
  runAwsServiceAttempt,
  withAwsDiscoveryExecution,
} from '../../src/providers/aws/execution.js';
import { runAwsRequest, withAwsServiceCallBudget } from '../../src/providers/aws/request.js';
import { createMemoryAwsRequestStore } from '../../src/providers/aws/request-store.js';

const credentials = { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' };
const response = () => ({
  response: {
    statusCode: 200,
    headers: { 'content-type': 'application/x-amz-json-1.0' },
    body: Buffer.from('{"Table":{"TableName":"test-table"}}'),
  },
});

afterEach(() => vi.restoreAllMocks());

it('provides command input to an async admission hook before sending a managed client created outside discovery', async () => {
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const handle = vi.fn().mockImplementation(async () => response());
  const client = getAwsClient(
    'dynamodb:eu-west-1',
    () => new DynamoDBClient({ region: 'eu-west-1', credentials, requestHandler: { handle } }),
  );
  const beforeRequest = vi.fn().mockImplementation(async () => gate);
  const request = runAwsServiceAttempt(() => client.send(new DescribeTableCommand({ TableName: 'test-table' })), {
    beforeRequest,
  });

  try {
    await vi.waitFor(() => expect(beforeRequest).toHaveBeenCalledWith({ TableName: 'test-table' }));
    expect(handle).not.toHaveBeenCalled();
    release();
    await expect(request).resolves.toMatchObject({ Table: { TableName: 'test-table' } });
    expect(handle).toHaveBeenCalledOnce();
  } finally {
    release();
    client.destroy();
  }
});

it('awaits transport admission after credential resolution and excludes its wait from handler timing outside discovery', async () => {
  let now = 1_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const resolveCredentials = vi.fn().mockResolvedValue(credentials);
  const handle = vi.fn().mockImplementation(async () => {
    now += 17;
    return response();
  });
  const client = getAwsClient(
    'dynamodb:eu-west-1',
    () => new DynamoDBClient({ region: 'eu-west-1', credentials: resolveCredentials, requestHandler: { handle } }),
  );
  const beforeTransport = vi.fn().mockImplementation(async () => {
    expect(resolveCredentials).toHaveBeenCalled();
    await gate;
    now += 2_000;
  });
  const onDispatch = vi.fn();
  const onTransport = vi.fn();
  const request = runAwsServiceAttempt(() => client.send(new DescribeTableCommand({ TableName: 'test-table' })), {
    beforeTransport,
    onDispatch,
    onTransport,
  });

  try {
    await vi.waitFor(() => expect(beforeTransport).toHaveBeenCalledOnce());
    expect(handle).not.toHaveBeenCalled();
    expect(onDispatch).not.toHaveBeenCalled();
    release();
    await expect(request).resolves.toMatchObject({ Table: { TableName: 'test-table' } });
    expect(handle).toHaveBeenCalledOnce();
    expect(onDispatch).toHaveBeenCalledExactlyOnceWith();
    expect(onTransport).toHaveBeenCalledExactlyOnceWith({ durationMs: 17, statusCode: 200 });
  } finally {
    release();
    client.destroy();
  }
});

it('observes physical handler time and one HTTP request per wrapped attempt despite SDK retry defaults', async () => {
  let now = 1_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const handle = vi.fn().mockImplementation(async () => {
    now += 17;
    return {
      response: {
        statusCode: 503,
        headers: { 'content-type': 'application/x-amz-json-1.0' },
        body: Buffer.from('{"__type":"ServiceUnavailable","message":"synthetic unavailable"}'),
      },
    };
  });
  const client = getAwsClient(
    'dynamodb:eu-west-1',
    () => new DynamoDBClient({ region: 'eu-west-1', credentials, maxAttempts: 5, requestHandler: { handle } }),
  );
  const beforeRequest = vi.fn().mockImplementation(async () => {
    now += 2_000;
  });
  const onTransport = vi.fn();

  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      await expect(
        runAwsServiceAttempt(() => client.send(new DescribeTableCommand({ TableName: 'test-table' })), {
          beforeRequest,
          onTransport,
        }),
      ).rejects.toMatchObject({ $metadata: { httpStatusCode: 503, attempts: 1 } });
      expect(handle).toHaveBeenCalledTimes(attempt);
      expect(beforeRequest).toHaveBeenCalledTimes(attempt);
      expect(onTransport).toHaveBeenCalledTimes(attempt);
      expect(onTransport).toHaveBeenLastCalledWith({ durationMs: 17, statusCode: 503 });
    }
  } finally {
    client.destroy();
  }
});

it.each([
  'admission',
  'credentials',
  'transport admission',
])('prevents transport when discovery is cancelled while %s is pending', async (pause) => {
  const controller = new AbortController();
  const reason = new DOMException('Synthetic cancellation', 'AbortError');
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const paused = vi.fn();
  const waitIfPaused = async (stage: string) => {
    if (pause === stage) {
      paused();
      await gate;
    }
  };
  const onDispatch = vi.fn();
  const handle = vi.fn().mockImplementation(async () => response());
  const client = getAwsClient(
    'dynamodb:eu-west-1',
    () =>
      new DynamoDBClient({
        region: 'eu-west-1',
        credentials: async () => {
          await waitIfPaused('credentials');
          return credentials;
        },
        requestHandler: { handle },
      }),
  );
  let attempt: Promise<unknown> | undefined;
  const run = withAwsDiscoveryExecution({ signal: controller.signal }, () => {
    attempt = runAwsServiceAttempt(() => client.send(new DescribeTableCommand({ TableName: 'test-table' })), {
      beforeRequest: () => waitIfPaused('admission'),
      beforeTransport: () => waitIfPaused('transport admission'),
      onDispatch,
    });
    return attempt;
  });
  const cancelled = expect(run).rejects.toBe(reason);

  try {
    await vi.waitFor(() => expect(paused).toHaveBeenCalled());
    controller.abort(reason);
    await cancelled;
    release();
    await expect(attempt).rejects.toBe(reason);
    expect(handle).not.toHaveBeenCalled();
    expect(onDispatch).not.toHaveBeenCalled();
  } finally {
    release();
    client.destroy();
  }
});

it('reports no physical dispatch or transport time when credentials are cancelled in the request wrapper', async () => {
  const controller = new AbortController();
  const reason = new DOMException('Synthetic cancellation', 'AbortError');
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const resolveCredentials = vi.fn().mockImplementation(async () => {
    await gate;
    return credentials;
  });
  const handle = vi.fn().mockImplementation(async () => response());
  const onAttempt = vi.fn();
  const client = getAwsClient(
    'dynamodb:eu-west-1',
    () => new DynamoDBClient({ region: 'eu-west-1', credentials: resolveCredentials, requestHandler: { handle } }),
  );
  let sdkAttempt: Promise<unknown> | undefined;
  const run = withAwsDiscoveryExecution({ signal: controller.signal }, () =>
    withAwsServiceCallBudget(
      () =>
        runAwsRequest('DynamoDB', 'DescribeTable', 'eu-west-1', () => {
          sdkAttempt = client.send(new DescribeTableCommand({ TableName: 'test-table' }));
          return sdkAttempt;
        }),
      { accountId: '111111111111', store: createMemoryAwsRequestStore(), onAttempt },
    ),
  );
  const cancelled = expect(run).rejects.toBe(reason);

  try {
    await vi.waitFor(() => expect(resolveCredentials).toHaveBeenCalled());
    controller.abort(reason);
    await cancelled;
    release();
    await expect(sdkAttempt).rejects.toBe(reason);
    await vi.waitFor(() => expect(onAttempt).toHaveBeenCalledOnce());
    expect(handle).not.toHaveBeenCalled();
    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ dispatched: false, transportDurationMs: 0, outcome: 'cancelled' }),
    );
  } finally {
    release();
    client.destroy();
  }
});

it('emits structured attempt telemetry without allowing a throwing debug logger to interrupt client cleanup', async () => {
  const event = { service: 'DynamoDB', operation: 'DescribeTable', attempt: 1, statusCode: 200 };
  const debugLogger = vi.fn().mockImplementation(() => {
    throw new Error('Synthetic logger failure');
  });
  const destroy = vi.fn();

  await expect(
    withAwsDiscoveryExecution({ debugLogger }, async () => {
      getAwsClient(
        'dynamodb:eu-west-1',
        () =>
          new DynamoDBClient({
            region: 'eu-west-1',
            credentials,
            requestHandler: { handle: async () => response(), destroy },
          }),
      );
      emitAwsRequestTelemetry(event);
    }),
  ).resolves.toBeUndefined();
  expect(debugLogger).toHaveBeenCalledExactlyOnceWith(
    'aws: attempt {"service":"DynamoDB","operation":"DescribeTable","attempt":1,"statusCode":200}',
  );
  expect(destroy).toHaveBeenCalledOnce();
});

it.each([
  'success',
  'failure',
])('preserves discovery transport diagnostics for %s without logging request data', async (outcome) => {
  let now = 1_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const debugLogger = vi.fn();
  const onTransport = vi.fn();
  const failure = new Error('Sensitive synthetic transport detail');

  await withAwsDiscoveryExecution({ debugLogger }, async () => {
    const client = getAwsClient(
      'dynamodb:eu-west-1',
      () =>
        new DynamoDBClient({
          region: 'eu-west-1',
          credentials,
          requestHandler: {
            handle: async () => {
              now += 23;
              if (outcome === 'failure') throw failure;
              return response();
            },
          },
        }),
    );
    const attempt = runAwsServiceAttempt(() => client.send(new DescribeTableCommand({ TableName: 'test-table' })), {
      onTransport,
    });
    if (outcome === 'failure') await expect(attempt).rejects.toBe(failure);
    else await expect(attempt).resolves.toMatchObject({ Table: { TableName: 'test-table' } });
  });

  expect(onTransport).toHaveBeenCalledExactlyOnceWith(
    outcome === 'failure' ? { durationMs: 23 } : { durationMs: 23, statusCode: 200 },
  );
  expect(debugLogger).toHaveBeenCalledExactlyOnceWith(
    outcome === 'failure'
      ? 'aws: transport dynamodb:eu-west-1 failed in 23ms'
      : 'aws: transport dynamodb:eu-west-1 returned HTTP 200 in 23ms',
  );
});
