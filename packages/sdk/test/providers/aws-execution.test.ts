import { createServer } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { createEc2Client, withAwsClientCredentials } from '../../src/providers/aws/client.js';
import { getAwsDiscoveryTimestamp, withAwsDiscoveryExecution } from '../../src/providers/aws/execution.js';
import { withAwsServiceCallBudget, withAwsServiceErrorContext } from '../../src/providers/aws/resources/utils.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('cancels queued service calls without dispatching them when active work finishes', async () => {
  const controller = new AbortController();
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started: number[] = [];
  let background: Promise<unknown> | undefined;
  const run = withAwsDiscoveryExecution({ signal: controller.signal }, () =>
    withAwsServiceCallBudget(async () => {
      background = Promise.allSettled(
        Array.from({ length: 20 }, (_, index) =>
          withAwsServiceErrorContext('EC2', 'DescribeInstances', 'eu-west-1', async () => {
            started.push(index);
            await gate;
          }),
        ),
      );
      await background;
    }),
  );
  const assertion = expect(run).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(started).toHaveLength(10));
  controller.abort();
  await assertion;
  release();
  await background;
  expect(started).toHaveLength(10);
});

it('cancels a retry backoff without issuing another attempt', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const execute = vi.fn().mockRejectedValue(Object.assign(new Error('throttled'), { name: 'ThrottlingException' }));
  let background: Promise<unknown> | undefined;
  const run = withAwsDiscoveryExecution({ signal: controller.signal }, async () => {
    background = withAwsServiceErrorContext('EC2', 'DescribeInstances', 'eu-west-1', execute);
    await background;
  });
  const assertion = expect(run).rejects.toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(0);
  expect(execute).toHaveBeenCalledOnce();
  controller.abort();
  await assertion;
  await vi.runAllTimersAsync();
  await background?.catch(() => undefined);
  expect(execute).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('aborts a real HTTP request at the discovery deadline', async () => {
  const server = createServer(() => undefined);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  let closed = false;
  server.on('connection', (socket) =>
    socket.on('close', () => {
      closed = true;
    }),
  );
  try {
    await expect(
      withAwsDiscoveryExecution({ timeoutMs: 50 }, async () => {
        const client = createEc2Client({ region: 'eu-west-1' });
        await client.config.requestHandler.handle(
          {
            protocol: 'http:',
            hostname: '127.0.0.1',
            port: address.port,
            method: 'GET',
            path: '/',
            headers: {},
            query: {},
          } as Parameters<typeof client.config.requestHandler.handle>[0],
          {},
        );
      }),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.waitFor(() => expect(closed).toBe(true));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('reuses clients only within one run and destroys them after completion', async () => {
  vi.useFakeTimers();
  const clients: ReturnType<typeof createEc2Client>[] = [];
  const destroys: ReturnType<typeof vi.spyOn>[] = [];
  await Promise.all(
    ['first', 'second'].map((key) =>
      withAwsClientCredentials({ accessKeyId: key, secretAccessKey: 'test' }, () =>
        withAwsDiscoveryExecution({}, async () => {
          const client = createEc2Client({ region: 'eu-west-1' });
          clients.push(client);
          destroys.push(vi.spyOn(client, 'destroy'));
          expect(createEc2Client({ region: 'eu-west-1' })).toBe(client);
          expect((await client.config.credentials()).accessKeyId).toBe(key);
          const timestamp = getAwsDiscoveryTimestamp();
          vi.setSystemTime(Date.now() + 1_000);
          expect(getAwsDiscoveryTimestamp()).toBe(timestamp);
        }),
      ),
    ),
  );
  expect(clients[0]).not.toBe(clients[1]);
  for (const destroy of destroys) expect(destroy).toHaveBeenCalledOnce();
});
