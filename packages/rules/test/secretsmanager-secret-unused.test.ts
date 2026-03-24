import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { secretsManagerSecretUnusedRule } from '../src/aws/secretsmanager/secret-unused.js';
import type { AwsSecretsManagerSecret } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createSecret = (overrides: Partial<AwsSecretsManagerSecret> = {}): AwsSecretsManagerSecret => ({
  accountId: '123456789012',
  lastAccessedDate: '2025-12-01T00:00:00.000Z',
  region: 'us-east-1',
  secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/db/password-AbCdEf',
  secretName: 'prod/db/password',
  ...overrides,
});

describe('secretsManagerSecretUnusedRule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flags secrets not accessed in the last 90 days', () => {
    const finding = secretsManagerSecretUnusedRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-secretsmanager-secrets': [createSecret()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        resourceId: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/db/password-AbCdEf',
      },
    ]);
  });

  it('skips secrets with recent access', () => {
    const finding = secretsManagerSecretUnusedRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-secretsmanager-secrets': [createSecret({ lastAccessedDate: '2026-03-10T00:00:00.000Z' })],
      }),
    });

    expect(finding).toBeNull();
  });
});
