import { LiveResourceBag } from '@cloudburn/rules';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runLiveScan } from '../src/engine/run-live.js';
import { discoverAwsResources } from '../src/providers/aws/discovery.js';

vi.mock('../src/providers/aws/discovery.js', () => ({ discoverAwsResources: vi.fn() }));

const accountId = '111111111111';
const region = 'eu-west-1';
const ruleId = 'CLDBRN-AWS-LAMBDA-2';
const run = (includeEvaluationResources = true) =>
  runLiveScan({ discovery: { enabledRules: [ruleId] }, iac: {} }, { mode: 'current' }, { includeEvaluationResources });

describe('metric rule evaluation coverage', () => {
  beforeEach(() => vi.resetAllMocks());
  const setup = (errors: number | null) =>
    vi.mocked(discoverAwsResources).mockResolvedValue({
      catalog: { indexType: 'LOCAL', resources: [], searchRegion: region },
      resources: new LiveResourceBag({
        'aws-lambda-functions': ['known', 'unknown'].map((functionName) => ({
          accountId,
          region,
          functionName,
          architectures: ['arm64'],
          memorySizeMb: 128,
          timeoutSeconds: 3,
        })),
        'aws-lambda-function-metrics': [
          {
            accountId,
            region,
            functionName: 'known',
            totalInvocationsLast7Days: 100,
            totalErrorsLast7Days: errors,
            averageDurationMsLast7Days: null,
          },
        ],
      }),
    });

  it('reports unknown instead of a complete pass and preserves assessed and missing resource identities', async () => {
    setup(0);
    const result = await run();
    expect(result.providers).toEqual([]);
    expect(result.evaluations?.rules[0]).toMatchObject({
      status: 'unknown',
      findingCount: 0,
      coverage: {
        assessed: [{ accountId, region, resourceId: 'known' }],
        unknown: [{ accountId, region, resourceId: 'unknown' }],
      },
    });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId, status: 'skipped' })]),
    );
  });

  it('retains a proven finding while reporting other resources as unknown', async () => {
    setup(20);
    const result = await run();
    expect(result.providers[0]?.rules[0]?.findings).toEqual([{ accountId, region, resourceId: 'known' }]);
    expect(result.evaluations?.rules[0]).toMatchObject({
      status: 'triggered',
      findingCount: 1,
      coverage: { unknown: [{ accountId, region, resourceId: 'unknown' }] },
    });
  });

  it('surfaces incomplete evidence even when evaluation resources were not requested', async () => {
    setup(null);
    const result = await run(false);
    expect(result.evaluations).toBeUndefined();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId, status: 'skipped' })]),
    );
  });

  it('never reports a complete pass when required evidence excluded an entire region', async () => {
    vi.mocked(discoverAwsResources).mockResolvedValue({
      catalog: { indexType: 'LOCAL', resources: [], searchRegion: region },
      resources: new LiveResourceBag({}),
      unavailableRegions: new Map([['aws-lambda-function-metrics', new Set([region])]]),
    });
    const result = await run();
    expect(result.evaluations?.rules[0]).toMatchObject({ status: 'unknown' });
    expect(result.evaluations?.rules[0]?.reason).toContain(region);
  });
});
