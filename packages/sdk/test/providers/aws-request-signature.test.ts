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
const minute = 60_000;
const start = Date.parse('2026-09-08T12:00:00Z');
const signatureTime = (request: HttpRequest): number => {
  const value = request.headers['x-amz-date'];
  if (!value) throw new Error('Expected a signed synthetic request.');
  return Date.parse(value.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'));
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each([
  'complete',
  'cancel',
] as const)('keeps signatures fresh during a long final-admission wait: %s', async (mode) => {
  vi.useFakeTimers();
  vi.setSystemTime(start);
  const delayedCredentials = Promise.withResolvers<void>();
  const resolvingCredentials = Promise.withResolvers<void>();
  const controller = new AbortController();
  const physical: Array<{ table: string; at: number; signatureAge: number }> = [];
  const attempts: AwsRequestAttemptTelemetry[] = [];
  const handle = async (request: HttpRequest) => {
    const table = JSON.parse(String(request.body)).TableName;
    const age = Date.now() - signatureTime(request);
    physical.push({ table, at: Date.now() - start, signatureAge: age });
    const expired = age >= 5 * minute;
    return {
      response: {
        statusCode: expired ? 400 : 200,
        headers: { 'content-type': 'application/x-amz-json-1.0' },
        body: Buffer.from(
          JSON.stringify(
            expired
              ? { __type: 'RequestExpired', message: 'Synthetic stale signature' }
              : { Table: { TableName: table } },
          ),
        ),
      },
    };
  };
  const delayed = getAwsClient(
    'signature-delayed',
    () =>
      new DynamoDBClient({
        region: 'eu-west-1',
        credentials: async () => {
          resolvingCredentials.resolve();
          await delayedCredentials.promise;
          return credentials;
        },
        requestHandler: { handle },
      }),
  );
  const ready = getAwsClient(
    'signature-ready',
    () => new DynamoDBClient({ region: 'eu-west-1', credentials, requestHandler: { handle } }),
  );
  const budget = {
    accountId: 'signature-account',
    store: createMemoryAwsRequestStore(),
    // Six minutes between starts makes a post-signing wait exceed the usual five-minute validity window.
    overrides: { 'dynamodb:control-plane-read': { ratePerSecond: 1 / 360, burst: 1 } },
    onAttempt: (event: AwsRequestAttemptTelemetry) => attempts.push(event),
  };
  let completed: Promise<PromiseSettledResult<unknown>[]> | undefined;
  const scan = withAwsDiscoveryExecution({ signal: controller.signal, timeoutMs: 15 * minute }, () => {
    completed = Promise.allSettled([
      withAwsServiceCallBudget(
        () =>
          runAwsRequest('DynamoDB', 'DescribeTable', 'eu-west-1', () =>
            delayed.send(new DescribeTableCommand({ TableName: 'delayed' })),
          ),
        budget,
      ),
      withAwsServiceCallBudget(
        () =>
          runAwsRequest('DynamoDB', 'DescribeTable', 'eu-west-1', () =>
            ready.send(new DescribeTableCommand({ TableName: 'ready' })),
          ),
        budget,
      ),
    ]);
    return completed;
  });
  const scanOutcome = scan.catch((error) => error);
  try {
    await resolvingCredentials.promise;
    await vi.advanceTimersByTimeAsync(6 * minute);
    expect(physical).toEqual([{ table: 'ready', at: 6 * minute, signatureAge: 0 }]);
    delayedCredentials.resolve();
    await vi.advanceTimersByTimeAsync(4 * minute);
    if (mode === 'cancel') controller.abort(new DOMException('Cancel signed wait', 'AbortError'));
    else await vi.advanceTimersByTimeAsync(2 * minute);
    const results = await completed;
    await scanOutcome;

    if (mode === 'complete') {
      expect(results?.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
      expect(physical).toEqual([
        { table: 'ready', at: 6 * minute, signatureAge: 0 },
        { table: 'delayed', at: 12 * minute, signatureAge: 2 * minute },
      ]);
      expect(attempts).toHaveLength(2);
      expect(attempts.every((event) => event.attempt === 1 && event.retryCount === 0)).toBe(true);
      expect(attempts).toContainEqual(expect.objectContaining({ preparationCount: 2, outcome: 'success' }));
    } else {
      expect(results?.map((result) => result.status)).toEqual(['rejected', 'fulfilled']);
      expect(physical).toHaveLength(1);
      expect(attempts).toContainEqual(
        expect.objectContaining({ preparationCount: 2, dispatched: false, outcome: 'cancelled' }),
      );
    }
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    controller.abort();
    delayedCredentials.resolve();
    await scanOutcome;
    delayed.destroy();
    ready.destroy();
  }
});
