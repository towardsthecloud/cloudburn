import { throwIfAwsExecutionAborted } from '../execution.js';
import { type CloudWatchMetricEvidence, type CloudWatchMetricQuery, fetchCloudWatchSignals } from './cloudwatch.js';

type EmitMetrics = (
  queries: Iterable<CloudWatchMetricQuery>,
  complete: (evidence: Map<string, CloudWatchMetricEvidence>) => void,
) => Promise<void>;

/**
 * Collects resource queries independently of bounded metadata producers.
 * Producers must await each emit and bound their own concurrency. A full flush
 * blocks producers; the final partial batch flushes when production ends.
 *
 * @param options - Fixed regional window and a producer of queries with resource completion callbacks.
 * @returns Resolves after all resource callbacks have consumed their metric evidence.
 */
export const collectResourceMetrics = async (options: {
  region: string;
  startTime: Date;
  endTime: Date;
  produce: (emit: EmitMetrics) => Promise<void>;
}): Promise<void> => {
  let pending: Array<{
    query: CloudWatchMetricQuery;
    accept: (evidence: CloudWatchMetricEvidence | undefined) => void;
  }> = [];
  let datapoints = 0;
  let serial = Promise.resolve();
  let stopped = false;
  const check = () => {
    throwIfAwsExecutionAborted();
    if (stopped) throw new Error('Resource metric collection has stopped.');
  };
  const flush = async () => {
    check();
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    datapoints = 0;
    const evidence = await fetchCloudWatchSignals({
      region: options.region,
      startTime: options.startTime,
      endTime: options.endTime,
      queries: batch.map(({ query }) => query),
    });
    check();
    for (const entry of batch) entry.accept(evidence.get(entry.query.id));
  };
  const emit: EmitMetrics = (queries, complete) => {
    const work = serial.then(async () => {
      check();
      const evidence = new Map<string, CloudWatchMetricEvidence>();
      let remaining = 0;
      let sealed = false;
      for (const query of queries) {
        const points = Math.ceil((options.endTime.getTime() - options.startTime.getTime()) / (query.period * 1000));
        if (pending.length > 0 && (pending.length >= 500 || datapoints + points > 100_800)) await flush();
        check();
        remaining += 1;
        pending.push({
          query,
          accept: (result) => {
            if (result) evidence.set(query.id, result);
            remaining -= 1;
            if (sealed && remaining === 0) complete(evidence);
          },
        });
        datapoints += points;
        if (pending.length >= 500 || datapoints >= 100_800) await flush();
      }
      sealed = true;
      if (remaining === 0) complete(evidence);
    });
    serial = work;
    // Active producers may finish after another fails. Observe every queued emit.
    void work.catch(() => {
      stopped = true;
    });
    return work;
  };
  try {
    await options.produce(emit);
    await serial;
    await flush();
  } finally {
    stopped = true;
    pending = [];
  }
};
