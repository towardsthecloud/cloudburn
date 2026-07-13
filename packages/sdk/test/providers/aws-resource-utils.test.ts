import { afterEach, describe, expect, it, vi } from 'vitest';
import { withAwsServiceCallBudget, withAwsServiceErrorContext } from '../../src/providers/aws/resources/utils.js';

const createThrottlingError = (): Error =>
  Object.assign(new Error('Rate exceeded'), {
    $metadata: {
      httpStatusCode: 400,
      requestId: 'req-throttle',
    },
    code: 'ThrottlingException',
    name: 'ThrottlingException',
  });

describe('withAwsServiceErrorContext', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries throttled AWS calls with exponential backoff and jitter before succeeding', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const execute = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(createThrottlingError())
      .mockRejectedValueOnce(createThrottlingError())
      .mockResolvedValue('ok');
    const onRetry = vi.fn();

    const resultPromise = withAwsServiceErrorContext(
      'Amazon CloudWatch Logs',
      'DescribeMetricFilters',
      'eu-central-1',
      execute,
      {
        initialDelayMs: 200,
        maxAttempts: 5,
        onRetry,
      },
    );

    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(600);
    await expect(resultPromise).resolves.toBe('ok');

    expect(execute).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        attempt: 1,
        delayMs: 300,
        maxAttempts: 5,
      }),
    );
    expect(onRetry).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        attempt: 2,
        delayMs: 600,
        maxAttempts: 5,
      }),
    );
  });
});

describe('withAwsServiceCallBudget', () => {
  const trackedCall = (tracker: { current: number; max: number }) => () =>
    new Promise<string>((resolve) => {
      tracker.current += 1;
      tracker.max = Math.max(tracker.max, tracker.current);

      setTimeout(() => {
        tracker.current -= 1;
        resolve('ok');
      }, 1);
    });

  it('caps concurrent calls to the same service and region across independent callers', async () => {
    const tracker = { current: 0, max: 0 };

    await withAwsServiceCallBudget(async () => {
      await Promise.all(
        Array.from({ length: 30 }, () =>
          withAwsServiceErrorContext('Amazon EC2', 'DescribeVolumes', 'eu-central-1', trackedCall(tracker)),
        ),
      );
    });

    expect(tracker.max).toBeGreaterThan(1);
    expect(tracker.max).toBeLessThanOrEqual(10);
  });

  it('budgets services and regions independently', async () => {
    const ec2Tracker = { current: 0, max: 0 };
    const rdsTracker = { current: 0, max: 0 };
    const combinedTracker = { current: 0, max: 0 };

    const trackedCombinedCall = (tracker: { current: number; max: number }) => {
      const call = trackedCall(tracker);
      const combined = trackedCall(combinedTracker);

      return async () => {
        const [result] = await Promise.all([call(), combined()]);

        return result;
      };
    };

    await withAwsServiceCallBudget(async () => {
      await Promise.all([
        ...Array.from({ length: 15 }, () =>
          withAwsServiceErrorContext('Amazon EC2', 'DescribeVolumes', 'eu-central-1', trackedCombinedCall(ec2Tracker)),
        ),
        ...Array.from({ length: 15 }, () =>
          withAwsServiceErrorContext(
            'Amazon RDS',
            'DescribeDBInstances',
            'eu-central-1',
            trackedCombinedCall(rdsTracker),
          ),
        ),
      ]);
    });

    expect(ec2Tracker.max).toBeLessThanOrEqual(10);
    expect(rdsTracker.max).toBeLessThanOrEqual(10);
    expect(combinedTracker.max).toBeGreaterThan(10);
  });

  it('leaves calls unbounded when no budget context is active', async () => {
    const tracker = { current: 0, max: 0 };

    await Promise.all(
      Array.from({ length: 30 }, () =>
        withAwsServiceErrorContext('Amazon EC2', 'DescribeVolumes', 'eu-central-1', trackedCall(tracker)),
      ),
    );

    expect(tracker.max).toBe(30);
  });

  it('releases the budget slot while waiting out a throttle backoff', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    let throttledOnce = false;
    const started: string[] = [];

    const budgetRun = withAwsServiceCallBudget(async () => {
      const throttledCall = withAwsServiceErrorContext('Amazon EC2', 'DescribeVolumes', 'eu-central-1', async () => {
        started.push('throttled');

        if (!throttledOnce) {
          throttledOnce = true;
          throw createThrottlingError();
        }

        return 'throttled-ok';
      });
      const followUpCalls = Promise.all(
        Array.from({ length: 10 }, (_value, index) =>
          withAwsServiceErrorContext('Amazon EC2', 'DescribeVolumes', 'eu-central-1', async () => {
            started.push(`follow-up-${index}`);

            return 'ok';
          }),
        ),
      );

      await Promise.all([throttledCall, followUpCalls]);
    });

    // While the throttled call sleeps out its backoff, all ten follow-up
    // calls must be able to start — the sleeping call may not hold a slot.
    await vi.advanceTimersByTimeAsync(0);
    expect(started.filter((name) => name.startsWith('follow-up'))).toHaveLength(10);

    await vi.advanceTimersByTimeAsync(10_000);
    await budgetRun;

    expect(started.filter((name) => name === 'throttled')).toHaveLength(2);
  });
});
