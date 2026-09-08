import { getAwsEvidenceTtl, isAwsEvidenceCacheEnabled, loadAwsCachedEvidence } from './evidence.js';
import { emitAwsRequestTelemetry, getAwsDiscoveryTimestamp } from './execution.js';
import { planCloudWatchSignals } from './metric-planner.js';
import type { CloudWatchMetricEvidence, CloudWatchMetricQuery } from './resources/cloudwatch.js';
import { mapWithConcurrency } from './resources/utils.js';

const DAY_MS = 86_400_000;
const RECENT_OVERLAP_MS = 3 * DAY_MS;
const RECENT_TTL_MS = 300_000;
const HISTORICAL_TTL_MS = 7 * DAY_MS;
const MAX_INTERVALS_PER_QUERY = 512;

type Request = { region: string; startTime: Date; endTime: Date; queries: CloudWatchMetricQuery[] };
type Fetch = (request: Request) => Promise<Map<string, CloudWatchMetricEvidence>>;

const intervalWidth = (period: number): number => Math.max(period, Math.floor(DAY_MS / period) * period);

const intervals = (start: number, end: number, period: number): Array<{ startTime: Date; endTime: Date }> => {
  const phase = start % period;
  const width = intervalWidth(period);
  const result = [];
  for (let cursor = start; cursor < end; ) {
    const next = Math.min(end, (Math.floor((cursor - phase) / width) + 1) * width + phase);
    result.push({ startTime: new Date(cursor), endTime: new Date(next) });
    cursor = next;
  }
  return result;
};

const validEvidence = (value: unknown): value is CloudWatchMetricEvidence => {
  if (!value || typeof value !== 'object') return false;
  const evidence = value as CloudWatchMetricEvidence;
  return (
    evidence.status === 'Complete' &&
    Array.isArray(evidence.points) &&
    Array.isArray(evidence.messages) &&
    Number.isInteger(evidence.attempts) &&
    evidence.attempts > 0 &&
    Number.isFinite(Date.parse(evidence.window?.startTime)) &&
    Number.isFinite(Date.parse(evidence.window?.endTime)) &&
    Number.isInteger(evidence.window?.periodSeconds) &&
    evidence.window.periodSeconds > 0 &&
    evidence.coverage?.observedPoints === evidence.points.length &&
    evidence.points.every((point) => Number.isFinite(point.value) && Number.isFinite(Date.parse(point.timestamp)))
  );
};

/**
 * Reuses complete metric intervals under the established AWS evidence scope and plans only misses.
 * @param request - Exact caller window and full metric identities with caller-owned IDs.
 * @param fetch - Existing paginated collector, retaining query and physical request budgets.
 * @param baselineRequests - Minimum initial requests for full-window collection, excluding pagination and retries.
 * @returns Evidence for the original window, including incomplete interval status and raw weighted inputs.
 */
export const fetchCachedCloudWatchSignals = async (
  request: Request,
  fetch: Fetch,
  baselineRequests: number,
): Promise<Map<string, CloudWatchMetricEvidence>> => {
  if (!isAwsEvidenceCacheEnabled()) return planCloudWatchSignals(request, fetch);
  const timestamp = getAwsDiscoveryTimestamp();
  let cacheHits = 0;
  let datapointsReused = 0;
  let datapointsFetched = 0;
  let queryDatapointsAvoided = 0;
  let allIntervalsReused = true;
  // Leave room for other dataset loaders while retaining enough lookups to pack 500-query requests.
  const maxIntervals = request.queries.reduce((maximum, query) => {
    const period = query.period * 1000;
    const phase = request.startTime.getTime() % period;
    const width = intervalWidth(period);
    return Math.max(
      maximum,
      Math.ceil((request.endTime.getTime() - phase) / width) -
        Math.floor((request.startTime.getTime() - phase) / width),
    );
  }, 1);
  // Unusually long caller windows retain the existing paginated collector without unbounded cache fan-out.
  if (maxIntervals > MAX_INTERVALS_PER_QUERY) return planCloudWatchSignals(request, fetch);
  const concurrency = Math.max(1, Math.min(500, Math.floor(7000 / maxIntervals)));
  const results = await mapWithConcurrency(request.queries, concurrency, async (query) => {
    const { id, ...metric } = query;
    const identity = {
      ...metric,
      dimensions: [...metric.dimensions].sort((a, b) => a.Name.localeCompare(b.Name) || a.Value.localeCompare(b.Value)),
    };
    const windows = intervals(request.startTime.getTime(), request.endTime.getTime(), query.period * 1000);
    const segments = await Promise.all(
      windows.map(async (window) => {
        const start = window.startTime.toISOString();
        const end = window.endTime.toISOString();
        const recent = timestamp - window.endTime.getTime() < RECENT_OVERLAP_MS;
        const result = await loadAwsCachedEvidence({
          datasetKey: 'metric-buckets',
          region: request.region,
          key: ['cloudwatch-metric-buckets-v1', request.region, identity, start, end],
          ttlMs: getAwsEvidenceTtl('metric-buckets', recent ? RECENT_TTL_MS : HISTORICAL_TTL_MS),
          validate: (value): value is CloudWatchMetricEvidence =>
            validEvidence(value) &&
            value.window.startTime === start &&
            value.window.endTime === end &&
            value.window.periodSeconds === query.period,
          load: async () => {
            const values = await planCloudWatchSignals({ ...request, ...window, queries: [query] }, fetch);
            const value = values.get(id);
            if (!value) throw new Error(`CloudWatch evidence missing for requested query ${id}.`);
            return { value, complete: value.status === 'Complete', observedAt: end, observationWindow: { start, end } };
          },
        });
        if (result.provenance.source === 'cache') {
          cacheHits += 1;
          datapointsReused += result.value.points.length;
          queryDatapointsAvoided += result.value.coverage.expectedPoints;
        } else {
          allIntervalsReused = false;
          datapointsFetched += result.value.points.length;
        }
        return result.value;
      }),
    );
    const points = segments.flatMap((segment) => segment.points);
    const failed =
      segments.find((segment) => segment.status === 'Forbidden') ??
      segments.find((segment) => segment.status !== 'Complete');
    return [
      id,
      {
        status: failed?.status ?? 'Complete',
        points,
        window: {
          startTime: request.startTime.toISOString(),
          endTime: request.endTime.toISOString(),
          periodSeconds: query.period,
        },
        coverage: {
          expectedPoints: Math.ceil((request.endTime.getTime() - request.startTime.getTime()) / (query.period * 1000)),
          observedPoints: points.length,
        },
        attempts: Math.max(...segments.map((segment) => segment.attempts)),
        messages: [
          ...new Map(
            segments.flatMap((segment) => segment.messages).map((message) => [JSON.stringify(message), message]),
          ).values(),
        ],
      } satisfies CloudWatchMetricEvidence,
    ] as const;
  });
  emitAwsRequestTelemetry({
    type: 'metric-cache',
    region: request.region,
    cacheHits,
    datapointsReused,
    datapointsFetched,
    queryDatapointsAvoided,
    requestsAvoided: allIntervalsReused ? baselineRequests : 0,
  });
  return new Map(results);
};
