import assert from 'node:assert/strict';
import {
  createRequestProcessFixture,
  type RequestProcessConfig,
} from '../test/fixtures/aws-admission/request-runner.ts';

// Run from the repository root with:
// pnpm --filter @cloudburn/sdk exec node scripts/benchmark-aws-requests.ts
// This fixture uses immediate synthetic responses and never creates an AWS client.
const fixture = await createRequestProcessFixture();
const results: {
  scenario: string;
  processes: number;
  logicalRequests: number;
  physicalAttempts: number;
  retries: number;
  cancelledBeforeDispatch: number;
  queueObservations: number;
  totalQueueMs: number;
  meanQueueMs: number;
  transportMs: number;
  elapsedMs: number;
}[] = [];
const baseline: RequestProcessConfig = {
  accountId: '111111111111',
  dataset: 'logActivity',
  requests: 8,
  overrides: { 'logs:DescribeLogStreams': { ratePerSecond: 4, burst: 2, retryCapacity: 2 } },
};

const run = async (scenario: string, configs: RequestProcessConfig[], cancelAfterFirst = false) => {
  const scans = configs.map((config) => fixture.start(config, scenario));
  await Promise.all(scans.map((scan) => scan.ready));
  const started = Date.now();
  for (const scan of scans) scan.child.send('go');
  if (cancelAfterFirst) {
    for (const scan of scans) {
      await scan.waitFor((events) => events.some((event) => event.type === 'dispatch'));
      scan.child.send('cancel');
    }
  }
  await Promise.all(scans.map((scan) => scan.completion));
  const elapsedMs = Date.now() - started;
  const events = scans.flatMap((scan) => scan.events);
  const attempts = events.flatMap((event) => (event.type === 'attempt' ? [event.event] : []));
  const dispatched = attempts.filter((event) => event.dispatched);
  const totalQueueMs = attempts.reduce((total, event) => total + event.queueDurationMs, 0);
  for (const [index, scan] of scans.entries()) {
    const outcome = scan.events.find((event) => event.type === 'done');
    assert.ok(outcome?.type === 'done', 'The synthetic scan must report its outcome.');
    if (cancelAfterFirst) assert.equal(outcome.error, 'AbortError');
    else {
      assert.equal(outcome.error, undefined);
      assert.deepEqual(
        outcome.results,
        Array.from(
          { length: configs[index]?.requests ?? 1 },
          () => (configs[index]?.mode === 'throttle' ? 'rejected' : 'fulfilled'),
        ),
      );
    }
  }
  results.push({
    scenario,
    processes: scans.length,
    logicalRequests: configs.reduce((total, config) => total + (config.requests ?? 1), 0),
    physicalAttempts: dispatched.length,
    retries: dispatched.filter((event) => event.attempt > 1).length,
    cancelledBeforeDispatch: attempts.filter((event) => event.outcome === 'cancelled' && !event.dispatched).length,
    queueObservations: attempts.length,
    totalQueueMs,
    meanQueueMs: Math.round(totalQueueMs / Math.max(1, attempts.length)),
    transportMs: attempts.reduce((total, event) => total + event.transportDurationMs, 0),
    elapsedMs,
  });
};

try {
  await run('fast-responses', [baseline]);
  await run('sustained-throttling', [{ ...baseline, requests: 2, mode: 'throttle' }]);
  await run('concurrent-scans', [
    { ...baseline, requests: 4 },
    { ...baseline, dataset: 'logRetention', requests: 4 },
  ]);
  await run(
    'cancellation',
    [
      {
        ...baseline,
        mode: 'hold',
        overrides: { 'logs:DescribeLogStreams': { ratePerSecond: 1, burst: 1, concurrency: 1 } },
      },
    ],
    true,
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        node: process.version,
        responses: 'Immediate synthetic responses; cancellation aborts the first held request.',
        queueObservations: 'Every attempt event, including cancellations and exhausted retry admission.',
        results,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await fixture.dispose();
}
