import { describe, expect, it, vi } from 'vitest';
import { withAwsServiceErrorContext } from '../../src/providers/aws/resources/utils.js';

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
