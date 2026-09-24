import type { AwsCostOptimizationHubSavingsPlansRecommendation, DiscoveryDatasetMap } from '@cloudburn/rules';
import { describe, expect, it } from 'vitest';
import type { ScanDiagnostic } from '../../src/index.js';
import {
  type AwsCapabilityDatasetObservation,
  buildAwsCapabilityOutcomes,
} from '../../src/providers/aws/capabilities.js';
import type { AwsCapabilityOutcome } from '../../src/types.js';

const REGIONS = ['eu-west-1', 'us-east-1'];

const diagnostic = (overrides: Partial<ScanDiagnostic> = {}): ScanDiagnostic => ({
  message: 'synthetic diagnostic',
  provider: 'aws',
  service: 'costoptimizationhub',
  source: 'discovery',
  status: 'error',
  ...overrides,
});

const observation = (overrides: Partial<AwsCapabilityDatasetObservation> = {}): AwsCapabilityDatasetObservation => ({
  datasetKey: 'aws-cost-optimization-hub-savings-plans-recommendations',
  diagnostics: [],
  unavailable: false,
  ...overrides,
});

const savingsPlansRecommendation = (
  overrides: Partial<AwsCostOptimizationHubSavingsPlansRecommendation> = {},
): AwsCostOptimizationHubSavingsPlansRecommendation => ({
  accountId: '111111111111',
  accountScope: '111111111111',
  actionType: 'PurchaseSavingsPlans',
  currencyCode: 'USD',
  estimatedMonthlyCost: 10,
  estimatedMonthlySavings: 4,
  estimatedSavingsPercentage: 40,
  hourlyCommitment: 0.5,
  lastRefreshTimestamp: '2024-01-01T00:00:00.000Z',
  paymentOption: 'No Upfront',
  recommendationId: 'recommendation-1',
  recommendationSource: 'ComputeOptimizer',
  savingsPlansType: 'ComputeSavingsPlans',
  term: 'One Year',
  ...overrides,
});

const byCapability = (outcomes: AwsCapabilityOutcome[]) =>
  new Map(outcomes.map((outcome) => [`${outcome.capability}:${outcome.scope.type}`, outcome]));

describe('buildAwsCapabilityOutcomes', () => {
  it('reports an available account capability for a successful empty Hub dataset', () => {
    const outcomes = buildAwsCapabilityOutcomes([observation()], REGIONS, {});

    expect(outcomes).toEqual([
      {
        capability: 'cost-optimization-hub-enrollment',
        datasetKeys: ['aws-cost-optimization-hub-savings-plans-recommendations'],
        reasons: [],
        scope: { type: 'account' },
        status: 'available',
      },
    ]);
  });

  it('marks Cost Optimization Hub not-enrolled datasets unavailable without touching other capabilities', () => {
    const outcomes = buildAwsCapabilityOutcomes(
      [
        observation({
          diagnostics: [diagnostic({ code: 'CostOptimizationHubNotEnrolled', status: 'skipped' })],
          unavailable: true,
        }),
        observation({ datasetKey: 'aws-cost-usage' }),
      ],
      REGIONS,
      {},
    );
    const byCapabilityKey = byCapability(outcomes);

    expect(byCapabilityKey.get('cost-optimization-hub-enrollment:account')).toMatchObject({
      reasons: ['not-enrolled'],
      status: 'unavailable',
    });
    expect(byCapabilityKey.get('cost-explorer-access:account')).toMatchObject({
      reasons: [],
      status: 'available',
    });
  });

  it('maps Resource Explorer setup diagnostics to bounded reasons', () => {
    const cases: Array<[string, string]> = [
      ['RESOURCE_EXPLORER_AGGREGATOR_REQUIRED', 'aggregator-required'],
      ['RESOURCE_EXPLORER_REGION_NOT_ENABLED', 'region-not-enabled'],
      ['RESOURCE_EXPLORER_NOT_ENABLED', 'region-not-enabled'],
      ['RESOURCE_EXPLORER_DEFAULT_VIEW_REQUIRED', 'default-view-required'],
      ['RESOURCE_EXPLORER_FILTERED_VIEW_UNSUPPORTED', 'filtered-view'],
      ['RESOURCE_EXPLORER_TAGS_VIEW_REQUIRED', 'tags-view-required'],
    ];
    for (const [code, reason] of cases) {
      const [outcome] = buildAwsCapabilityOutcomes(
        [
          observation({
            datasetKey: 'aws-resource-explorer-untagged-resources',
            diagnostics: [diagnostic({ code, service: 'resource-explorer', status: 'error' })],
            unavailable: true,
          }),
        ],
        REGIONS,
        {},
      );
      expect(outcome).toMatchObject({
        capability: 'resource-explorer-aggregator',
        reasons: [reason],
        status: 'unavailable',
      });
    }
  });

  it('prefers bounded access-denied codes over a generic error status', () => {
    const [outcome] = buildAwsCapabilityOutcomes(
      [
        observation({
          datasetKey: 'aws-cost-usage',
          diagnostics: [diagnostic({ code: 'AccessDeniedException', service: 'costexplorer', status: 'error' })],
          unavailable: true,
        }),
      ],
      REGIONS,
      {},
    );

    expect(outcome).toMatchObject({ reasons: ['access-denied'], status: 'unavailable' });
  });

  it('classifies arbitrary service failures as errors and throttling separately', () => {
    const [serviceError] = buildAwsCapabilityOutcomes(
      [
        observation({
          datasetKey: 'aws-cost-usage',
          diagnostics: [diagnostic({ code: 'InternalServerException', service: 'costexplorer' })],
          unavailable: true,
        }),
      ],
      REGIONS,
      {},
    );
    const [throttled] = buildAwsCapabilityOutcomes(
      [
        observation({
          datasetKey: 'aws-cost-usage',
          diagnostics: [diagnostic({ code: 'TooManyRequestsException', service: 'costexplorer', status: 'error' })],
          unavailable: true,
        }),
      ],
      REGIONS,
      {},
    );
    const [throttledStatus] = buildAwsCapabilityOutcomes(
      [
        observation({
          datasetKey: 'aws-cost-usage',
          diagnostics: [diagnostic({ service: 'costexplorer', status: 'throttled' })],
          unavailable: true,
        }),
      ],
      REGIONS,
      {},
    );

    expect(serviceError).toMatchObject({ reasons: ['service-error'], status: 'error' });
    expect(throttled).toMatchObject({ reasons: ['throttled'], status: 'error' });
    expect(throttledStatus).toMatchObject({ reasons: ['throttled'], status: 'error' });
  });

  it('keeps retained incomplete Hub rows unavailable instead of claiming partial success', () => {
    const outcomes = buildAwsCapabilityOutcomes(
      [
        observation({
          diagnostics: [diagnostic({ code: 'CostOptimizationHubRecommendationIncomplete', status: 'skipped' })],
          unavailable: true,
        }),
      ],
      REGIONS,
      {
        'aws-cost-optimization-hub-savings-plans-recommendations': [
          savingsPlansRecommendation({
            recommendationId: 'retained-1',
          }),
        ],
      },
    );

    expect(outcomes).toEqual([
      {
        capability: 'cost-optimization-hub-enrollment',
        datasetKeys: ['aws-cost-optimization-hub-savings-plans-recommendations'],
        reasons: ['incomplete-evidence'],
        scope: { type: 'account' },
        status: 'unavailable',
      },
    ]);
  });

  it('degrades a capability to partial when one of its datasets succeeds and another is unavailable', () => {
    const outcomes = buildAwsCapabilityOutcomes(
      [
        observation(),
        observation({
          datasetKey: 'aws-cost-optimization-hub-idle-recommendations',
          diagnostics: [diagnostic({ code: 'AccessDenied', status: 'access_denied' })],
          unavailable: true,
        }),
      ],
      REGIONS,
      {},
    );

    expect(outcomes).toEqual([
      {
        capability: 'cost-optimization-hub-enrollment',
        datasetKeys: [
          'aws-cost-optimization-hub-idle-recommendations',
          'aws-cost-optimization-hub-savings-plans-recommendations',
        ],
        reasons: ['access-denied'],
        scope: { type: 'account' },
        status: 'partial',
      },
    ]);
  });

  it('keeps regional partial failure visible on the Compute Optimizer capability', () => {
    const outcomes = buildAwsCapabilityOutcomes(
      [
        observation({
          datasetKey: 'aws-lambda-memory-recommendations',
          diagnostics: [
            diagnostic({
              code: 'AccessDeniedException',
              region: 'us-east-1',
              service: 'lambda',
              status: 'access_denied',
            }),
          ],
          unavailableRegions: ['us-east-1'],
        }),
      ],
      REGIONS,
      {},
    );

    expect(outcomes).toEqual([
      {
        capability: 'compute-optimizer-enrollment',
        datasetKeys: ['aws-lambda-memory-recommendations'],
        reasons: ['access-denied', 'incomplete-evidence'],
        scope: { type: 'regional', regions: REGIONS },
        status: 'partial',
      },
    ]);
  });

  it('treats unknown resource coverage as partial evidence', () => {
    const [outcome] = buildAwsCapabilityOutcomes(
      [
        observation({
          coverage: { assessed: [], unknown: [{ resourceId: 'function-1' }] },
          datasetKey: 'aws-lambda-memory-recommendations',
        }),
      ],
      REGIONS,
      {},
    );

    expect(outcome).toMatchObject({
      capability: 'compute-optimizer-enrollment',
      reasons: ['incomplete-evidence'],
      status: 'partial',
    });
  });

  it('reports a catalog-backed dataset with no matching resources as not assessed', () => {
    const [outcome] = buildAwsCapabilityOutcomes(
      [observation({ datasetKey: 'aws-lambda-memory-recommendations', notAssessed: true })],
      REGIONS,
      {},
    );

    expect(outcome).toMatchObject({
      capability: 'compute-optimizer-enrollment',
      reasons: ['not-assessed'],
      status: 'unavailable',
    });
  });

  it('marks unavailable datasets without diagnostics as dataset-unavailable', () => {
    const [outcome] = buildAwsCapabilityOutcomes(
      [observation({ datasetKey: 'aws-cost-guardrail-budgets', unavailable: true })],
      REGIONS,
      {},
    );

    expect(outcome).toMatchObject({
      capability: 'budgets-access',
      reasons: ['dataset-unavailable'],
      status: 'unavailable',
    });
  });

  it('distinguishes unavailable source data from incomplete or missing evidence', () => {
    const outcomes = buildAwsCapabilityOutcomes(
      [
        observation({
          datasetKey: 'aws-sagemaker-savings-plans-coverage',
          diagnostics: [diagnostic({ code: 'DataUnavailableException', status: 'skipped' })],
          unavailable: true,
        }),
      ],
      REGIONS,
      {},
    );

    expect(outcomes).toEqual([
      {
        capability: 'cost-explorer-access',
        datasetKeys: ['aws-sagemaker-savings-plans-coverage'],
        reasons: ['data-unavailable'],
        scope: { type: 'account' },
        status: 'unavailable',
      },
    ]);

    const [incomplete] = buildAwsCapabilityOutcomes(
      [
        observation({
          datasetKey: 'aws-sagemaker-savings-plans-coverage',
          diagnostics: [diagnostic({ code: 'SavingsPlansCoverageIncomplete', status: 'skipped' })],
          unavailable: true,
        }),
      ],
      REGIONS,
      {},
    );

    expect(incomplete).toMatchObject({ reasons: ['incomplete-evidence'], status: 'unavailable' });
  });

  it('deduplicates reasons and orders outcomes deterministically across datasets', () => {
    const outcomes = buildAwsCapabilityOutcomes(
      [
        observation({
          datasetKey: 'aws-cost-optimization-hub-rightsizing-recommendations',
          diagnostics: [diagnostic({ code: 'CostOptimizationHubNotEnrolled', status: 'skipped' })],
          unavailable: true,
        }),
        observation({
          datasetKey: 'aws-cost-optimization-hub-idle-recommendations',
          diagnostics: [diagnostic({ code: 'CostOptimizationHubNotEnrolled', status: 'skipped' })],
          unavailable: true,
        }),
        observation({ datasetKey: 'aws-cost-usage', unavailable: true }),
        observation({ datasetKey: 'aws-cost-anomaly-monitors', unavailable: true }),
      ],
      REGIONS,
      {},
    );

    expect(outcomes.map((outcome) => outcome.capability)).toEqual([
      'cost-explorer-access',
      'cost-optimization-hub-enrollment',
    ]);
    expect(outcomes[0]).toMatchObject({
      datasetKeys: ['aws-cost-anomaly-monitors', 'aws-cost-usage'],
      reasons: ['dataset-unavailable'],
    });
    expect(outcomes[1]).toMatchObject({
      datasetKeys: [
        'aws-cost-optimization-hub-idle-recommendations',
        'aws-cost-optimization-hub-rightsizing-recommendations',
      ],
      reasons: ['not-enrolled'],
    });
  });

  it('emits one primary outcome per capability regardless of dataset count', () => {
    const hubDatasets = [
      'aws-cost-optimization-hub-savings-plans-recommendations',
      'aws-cost-optimization-hub-reservation-recommendations',
      'aws-cost-optimization-hub-rightsizing-recommendations',
      'aws-cost-optimization-hub-idle-recommendations',
      'aws-cost-optimization-hub-upgrade-recommendations',
      'aws-cost-optimization-hub-graviton-recommendations',
    ] as const;
    const outcomes = buildAwsCapabilityOutcomes(
      hubDatasets.map((datasetKey) => observation({ datasetKey })),
      REGIONS,
      {},
    );

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.scope).toEqual({ type: 'account' });
    expect(outcomes[0]?.datasetKeys).toEqual([...hubDatasets].sort());
  });

  it('ignores datasets without a capability mapping', () => {
    const outcomes = buildAwsCapabilityOutcomes(
      [
        observation({
          datasetKey: 'aws-ebs-volumes',
          diagnostics: [diagnostic({ code: 'InternalServerException', service: 'ec2' })],
          unavailable: true,
        }),
      ],
      REGIONS,
      {},
    );

    expect(outcomes).toEqual([]);
  });

  it('projects observed Hub recommendation sources separately from direct enrollment', () => {
    const outcomes = buildAwsCapabilityOutcomes([observation()], REGIONS, {
      'aws-cost-optimization-hub-savings-plans-recommendations': [
        savingsPlansRecommendation({
          recommendationId: 'co-1',
          region: 'us-east-1',
        }),
        savingsPlansRecommendation({
          estimatedMonthlyCost: 20,
          estimatedMonthlySavings: 8,
          recommendationId: 'ce-1',
          recommendationSource: 'CostExplorer',
        }),
        {
          actionType: 'PurchaseSavingsPlans',
          recommendationId: 'no-account',
          recommendationSource: 'ComputeOptimizer',
        } as unknown as AwsCostOptimizationHubSavingsPlansRecommendation,
      ],
    });

    expect(outcomes).toEqual([
      {
        capability: 'compute-optimizer-enrollment',
        datasetKeys: ['aws-cost-optimization-hub-savings-plans-recommendations'],
        reasons: [],
        scope: { accountId: '111111111111', region: 'us-east-1', type: 'recommendation-source' },
        status: 'available',
      },
      {
        capability: 'cost-explorer-access',
        datasetKeys: ['aws-cost-optimization-hub-savings-plans-recommendations'],
        reasons: [],
        scope: { accountId: '111111111111', type: 'recommendation-source' },
        status: 'available',
      },
      {
        capability: 'cost-optimization-hub-enrollment',
        datasetKeys: ['aws-cost-optimization-hub-savings-plans-recommendations'],
        reasons: [],
        scope: { type: 'account' },
        status: 'available',
      },
    ]);
  });

  it('keeps direct capability outcomes independent from observed Hub recommendation sources', () => {
    const observations = [
      observation({
        datasetKey: 'aws-lambda-memory-recommendations',
        diagnostics: [diagnostic({ code: 'OptInRequiredException', service: 'computeoptimizer', status: 'error' })],
        unavailable: true,
      }),
      observation(),
    ];
    const values = {
      'aws-cost-optimization-hub-savings-plans-recommendations': [
        savingsPlansRecommendation({ recommendationId: 'co-1', region: 'us-east-1' }),
      ],
    } satisfies Partial<DiscoveryDatasetMap>;
    const expected: AwsCapabilityOutcome[] = [
      {
        capability: 'compute-optimizer-enrollment',
        datasetKeys: ['aws-cost-optimization-hub-savings-plans-recommendations'],
        reasons: [],
        scope: { accountId: '111111111111', region: 'us-east-1', type: 'recommendation-source' },
        status: 'available',
      },
      {
        capability: 'compute-optimizer-enrollment',
        datasetKeys: ['aws-lambda-memory-recommendations'],
        reasons: ['not-enrolled'],
        scope: { regions: ['eu-west-1', 'us-east-1'], type: 'regional' },
        status: 'unavailable',
      },
      {
        capability: 'cost-optimization-hub-enrollment',
        datasetKeys: ['aws-cost-optimization-hub-savings-plans-recommendations'],
        reasons: [],
        scope: { type: 'account' },
        status: 'available',
      },
    ];

    expect(buildAwsCapabilityOutcomes(observations, REGIONS, values)).toEqual(expected);
    expect(
      buildAwsCapabilityOutcomes([...observations].reverse(), REGIONS, {
        'aws-cost-optimization-hub-savings-plans-recommendations': [
          ...values['aws-cost-optimization-hub-savings-plans-recommendations'],
        ].reverse(),
      }),
    ).toEqual(expected);
  });

  it('ignores recommendation sources outside the known source catalog', () => {
    const outcomes = buildAwsCapabilityOutcomes([observation()], REGIONS, {
      'aws-cost-optimization-hub-savings-plans-recommendations': [
        savingsPlansRecommendation({
          recommendationId: 'odd-1',
          recommendationSource: 'toString' as 'ComputeOptimizer',
        }),
      ],
    });

    expect(outcomes).toEqual([
      {
        capability: 'cost-optimization-hub-enrollment',
        datasetKeys: ['aws-cost-optimization-hub-savings-plans-recommendations'],
        reasons: [],
        scope: { type: 'account' },
        status: 'available',
      },
    ]);
  });
});
