import type { EC2ClientConfig } from '@aws-sdk/client-ec2';
import { afterEach, expect, it, vi } from 'vitest';
import { createEc2Client, withAwsClientCredentials } from '../../src/providers/aws/client.js';
import { withAwsDiscoveryExecution } from '../../src/providers/aws/execution.js';
import { runAwsRequest, withAwsServiceCallBudget } from '../../src/providers/aws/request.js';
import { createMemoryAwsRequestStore } from '../../src/providers/aws/request-store.js';

const suppliedCredentials = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-ec2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-ec2')>();
  return {
    ...actual,
    EC2Client: class extends actual.EC2Client {
      constructor(config: EC2ClientConfig) {
        super(config);
        suppliedCredentials(config.credentials);
      }
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each([
  'object',
  'provider',
] as const)('clears explicit credential %s context from deferred cleanup', async (kind) => {
  vi.useFakeTimers();
  const identity = { accessKeyId: 'test-access-key', secretAccessKey: 'test-secret-key' };
  const provider = vi.fn(async () => identity);
  const credentials = kind === 'provider' ? provider : identity;
  const inspectClientCredentials = (): EC2ClientConfig['credentials'] => {
    const client = createEc2Client({ region: 'eu-west-1' });
    const supplied = suppliedCredentials.mock.lastCall?.[0];
    client.destroy();
    return supplied;
  };
  const normalCredentials: EC2ClientConfig['credentials'][] = [];
  const cleanupCredentials: EC2ClientConfig['credentials'][] = [];
  const store = createMemoryAwsRequestStore();
  const update = store.update;
  let completed = false;
  let writable = false;
  vi.spyOn(store, 'update').mockImplementation((...args) => {
    if (completed) {
      cleanupCredentials.push(inspectClientCredentials());
      if (!writable) return Promise.reject(new Error('Synthetic cleanup contention'));
    }
    return update(...args);
  });

  await withAwsClientCredentials(credentials, async () => {
    await expect(
      withAwsDiscoveryExecution({ timeoutMs: 2_000 }, () =>
        withAwsServiceCallBudget(
          () =>
            runAwsRequest('Amazon EC2', 'DescribeVolumes', 'eu-west-1', async () => {
              normalCredentials.push(inspectClientCredentials());
              completed = true;
              return 'preserved response';
            }),
          { accountId: 'cleanup-credential-context', store },
        ),
      ),
    ).resolves.toBe('preserved response');
    normalCredentials.push(inspectClientCredentials());
  });

  try {
    const beforeRetry = cleanupCredentials.length;
    await vi.advanceTimersByTimeAsync(100);
    expect(cleanupCredentials.length).toBeGreaterThan(beforeRetry);
    expect(normalCredentials).toEqual([credentials, credentials]);
    expect(cleanupCredentials.every((value) => value === undefined)).toBe(true);
    expect(provider).not.toHaveBeenCalled();
  } finally {
    writable = true;
    await vi.advanceTimersByTimeAsync(100);
  }
  expect(vi.getTimerCount()).toBe(0);
});
