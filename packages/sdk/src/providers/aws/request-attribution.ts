import { AsyncLocalStorage } from 'node:async_hooks';

/** Resolves the datasets still contributing to deferred request work. */
export type AwsRequestDatasetSource = () => readonly string[];
type Attribution = { datasets?: AwsRequestDatasetSource; queries?: ReadonlyMap<string, readonly string[]> };
const context = new AsyncLocalStorage<Attribution>();

/** Returns the datasets responsible for the current request, when known. */
export const getAwsRequestDatasets = (): readonly string[] | undefined => getAwsRequestDatasetSource()?.();

/** Returns the current dataset source so deferred requests can resolve consumers when dispatched. */
export const getAwsRequestDatasetSource = (): AwsRequestDatasetSource | undefined => context.getStore()?.datasets;

/**
 * Retains a live dataset source across work that may acquire additional consumers before dispatch.
 * @param datasets - Dataset identities resolved when the request is attributed.
 * @param run - Work that shares the source, including its asynchronous continuations.
 * @returns The work result.
 */
export const withAwsRequestDatasetSource = <T>(datasets: AwsRequestDatasetSource, run: () => T): T =>
  context.run({ datasets }, run);

/**
 * Attributes dataset work without replacing its quota budget or execution ownership.
 * @param dataset - Registry dataset responsible for the work.
 * @param run - Dataset collection, including its asynchronous continuations.
 * @returns The collection result.
 */
export const withAwsDatasetAttribution = <T>(dataset: string, run: () => T): T =>
  withAwsRequestDatasetSource(() => [dataset], run);

/**
 * Retains all consumers of each remapped metric query until transport batching selects its queries.
 * @param queries - Dataset identities indexed by the planner's remapped query IDs.
 * @param run - Batched metric collection, including pagination and retries.
 * @returns The collection result.
 */
export const withAwsMetricAttribution = <T>(queries: Attribution['queries'], run: () => T): T =>
  context.run({ queries }, run);

/**
 * Selects attribution for one metric batch or retry without duplicating physical attempt events.
 * @param queryIds - Queries included in this request.
 * @param run - Request work.
 * @returns The request result.
 */
export const withAwsMetricQueryAttribution = <T>(queryIds: string[], run: () => T): T => {
  const queries = context.getStore()?.queries;
  if (!queries) return run();
  const datasets = [...new Set(queryIds.flatMap((id) => queries.get(id) ?? []))].sort();
  return withAwsRequestDatasetSource(() => datasets, run);
};
