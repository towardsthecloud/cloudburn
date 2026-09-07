import type { CloudWatchMetricEvidence, CloudWatchMetricPoint } from '../../src/providers/aws/resources/cloudwatch.js';

/**
 * Builds complete CloudWatch evidence for focused hydrator fixtures.
 *
 * @param points - Metric observations returned by the synthetic CloudWatch boundary.
 * @param overrides - Evidence fields that model incomplete or failed observations.
 * @returns Typed evidence for one requested metric series.
 */
export const completeMetricEvidence = (
  points: CloudWatchMetricPoint[],
  overrides: Partial<CloudWatchMetricEvidence> = {},
): CloudWatchMetricEvidence => ({
  attempts: 1,
  coverage: { expectedPoints: points.length, observedPoints: points.length },
  messages: [],
  points,
  status: 'Complete',
  window: {
    endTime: '2025-02-01T00:00:00.000Z',
    periodSeconds: 86400,
    startTime: '2025-01-01T00:00:00.000Z',
  },
  ...overrides,
});
