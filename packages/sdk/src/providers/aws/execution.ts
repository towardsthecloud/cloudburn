import { AsyncLocalStorage } from 'node:async_hooks';
import type { RetryStrategy, RetryStrategyV2 } from '@aws-sdk/types';

const serviceAttemptContext = new AsyncLocalStorage<boolean>();
const singleAttemptStrategy: RetryStrategyV2 = {
  acquireInitialRetryToken: async () => ({
    getRetryCount: () => 0,
    getRetryDelay: () => 0,
    getRetryCost: () => undefined,
  }),
  refreshRetryTokenForRetry: async () => {
    throw new Error('The service request budget owns retries.');
  },
  recordSuccess: () => undefined,
};

type ManagedAwsClient = {
  config: {
    maxAttempts: () => Promise<number>;
    retryStrategy: () => Promise<RetryStrategy | RetryStrategyV2>;
  };
  destroy: () => void;
};

/**
 * Runs one physical request under a service wrapper's retry budget.
 *
 * @param execute - AWS SDK call whose retries are owned by its caller.
 * @returns The single-attempt response or error.
 */
export const runAwsServiceAttempt = <T>(execute: () => Promise<T>): Promise<T> =>
  serviceAttemptContext.run(true, execute);

/**
 * Configures retry ownership for an AWS client.
 *
 * @param key - Service and region identifying the client within a discovery run.
 * @param create - Constructs the service client with its normal SDK defaults.
 * @returns The configured client.
 */
export const getAwsClient = <T extends ManagedAwsClient>(_key: string, create: () => T): T => {
  const client = create();
  const retryStrategy = client.config.retryStrategy;
  const maxAttempts = client.config.maxAttempts;
  client.config.retryStrategy = () =>
    serviceAttemptContext.getStore() ? Promise.resolve(singleAttemptStrategy) : retryStrategy();
  client.config.maxAttempts = () => (serviceAttemptContext.getStore() ? Promise.resolve(1) : maxAttempts());
  return client;
};
