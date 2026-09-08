import { withAwsDiscoveryExecution } from '../../../src/providers/aws/execution.js';
import { withAwsServiceCallBudget, withAwsServiceErrorContext } from '../../../src/providers/aws/resources/utils.js';
import type { RequestProcessConfig, RequestProcessEvent } from './request-runner.js';

const config = JSON.parse(process.argv[2] as string) as RequestProcessConfig;
const controller = new AbortController();
const send = (event: RequestProcessEvent): void => {
  process.send?.(event);
};
let release: (() => void) | undefined;
const held = new Promise<void>((resolve) => {
  release = resolve;
});
const stopped = Promise.withResolvers<void>();

process.on('message', (message) => {
  if (message === 'cancel') controller.abort(new DOMException('Fixture cancelled.', 'AbortError'));
  if (message === 'release') release?.();
  if (message === 'stop') stopped.resolve();
});

send({ type: 'ready' });
await new Promise<void>((resolve) => {
  const start = (message: unknown) => {
    if (message !== 'go') return;
    process.off('message', start);
    resolve();
  };
  process.on('message', start);
});

let pending: Promise<PromiseSettledResult<void>[]> | undefined;
try {
  const results = await withAwsDiscoveryExecution(
    { signal: controller.signal, timeoutMs: config.timeoutMs ?? 20_000 },
    () =>
      withAwsServiceCallBudget(
        async () => {
          pending = Promise.allSettled(
            Array.from({ length: config.requests ?? 1 }, (_, request) => {
              let attempts = 0;
              return withAwsServiceErrorContext(
                config.service ?? 'Amazon CloudWatch Logs',
                config.operation ?? 'DescribeLogStreams',
                config.region ?? 'eu-west-1',
                async () => {
                  attempts += 1;
                  send({ type: 'dispatch', at: Date.now(), request, attempt: attempts, dataset: config.dataset });
                  if (config.mode === 'hold') await held;
                  if (config.mode === 'throttle') {
                    throw Object.assign(new Error('Synthetic throttling'), { name: 'ThrottlingException' });
                  }
                },
                { initialDelayMs: 0 },
              );
            }),
          );
          await new Promise<void>((resolve) => setImmediate(resolve));
          send({ type: 'submitted' });
          return pending;
        },
        {
          accountId: config.accountId,
          attribution: { dataset: config.dataset, collector: 'offline-request-fixture' },
          overrides: config.overrides,
          onAttempt: (event) => send({ type: 'attempt', event }),
        },
      ),
  );
  send({ type: 'done', results: results.map((result) => result.status) });
} catch (error) {
  await pending;
  send({ type: 'done', results: [], error: error instanceof Error ? error.name : String(error) });
} finally {
  if (config.stayAliveAfterDone) await stopped.promise;
  process.disconnect?.();
}
