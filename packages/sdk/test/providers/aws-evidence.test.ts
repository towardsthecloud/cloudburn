import { describe, expect, it, vi } from 'vitest';
import { createMemoryEvidenceCacheStore } from '../../src/evidence-cache.js';
import {
  getAwsEvidenceProvenance,
  loadAwsCachedEvidence,
  withAwsEvidenceCache,
} from '../../src/providers/aws/evidence.js';
import { withAwsDiscoveryExecution } from '../../src/providers/aws/execution.js';

vi.mock('../../src/providers/aws/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/aws/client.js')>()),
  resolveAwsEvidenceCredentials: async () => ({
    accessKeyId: 'SYNTHETIC',
    secretAccessKey: 'synthetic',
    sessionToken: 'session-a',
  }),
  resolveAwsCallerIdentity: async () => ({
    accountId: '111111111111',
    arn: 'arn:aws:iam::111111111111:role/synthetic',
  }),
}));

describe('AWS evidence integration', () => {
  it('restores supporting pricing provenance when normalized customer evidence is reused', async () => {
    const store = createMemoryEvidenceCacheStore();
    const loadPrice = vi.fn(async () => ({ value: null, complete: false }));
    const scan = () =>
      withAwsDiscoveryExecution({}, () =>
        withAwsEvidenceCache(
          {
            cache: { store },
            target: { mode: 'region', region: 'eu-west-1' },
          },
          async () => {
            await loadAwsCachedEvidence({
              datasetKey: 'activity',
              key: ['activity', 'v1'],
              ttlMs: 300_000,
              load: async () => {
                await loadAwsCachedEvidence({
                  datasetKey: 'public-pricing:example',
                  key: ['price', 'eu-west-1'],
                  ttlMs: 43_200_000,
                  public: true,
                  load: loadPrice,
                });
                return { value: { activity: 0, price: null }, complete: true };
              },
            });
            return getAwsEvidenceProvenance();
          },
        ),
      );
    await scan();
    const reused = await scan();
    expect(loadPrice).toHaveBeenCalledTimes(1);
    expect(reused).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ datasetKey: 'activity', complete: true, source: 'cache' }),
        expect.objectContaining({ datasetKey: 'public-pricing:example', complete: false, source: 'cache' }),
      ]),
    );
  });
});
