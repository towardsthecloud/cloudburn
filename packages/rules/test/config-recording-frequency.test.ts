import { describe, expect, it } from 'vitest';
import {
  configRecordingFrequencyRule,
  createAwsConfigRecordingFrequencyImpact,
} from '../src/aws/config/recording-frequency.js';
import type { AwsConfigRecordingFrequencyReview } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createReview = (
  overrides: Partial<AwsConfigRecordingFrequencyReview> = {},
): AwsConfigRecordingFrequencyReview => ({
  accountId: '123456789012',
  allSupported: true,
  configurationItemsRecorded: 2_000,
  configuredResourceTypes: [],
  currentRecordingFrequency: 'CONTINUOUS',
  defaultRecordingFrequency: 'CONTINUOUS',
  continuousRecordingUnitPriceUsd: 0.003,
  dailyRecordingUnitPriceUsd: 0.012,
  estimatedMonthlyConfigurationItemReduction: 4_136,
  estimatedMonthlyRecordingCostReductionUsd: 11.06,
  excludedResourceTypes: [],
  firewallManagerDependent: false,
  includeGlobalResourceTypes: false,
  observationWindowDays: 14,
  paidServiceLinkedRecorderDependent: false,
  recorderArn: 'arn:aws:config:eu-central-1:123456789012:configuration-recorder/default/abc',
  recorderName: 'default',
  recordedResourceCount: 5,
  recordingModeOverrides: [],
  recordingScope: 'PAID',
  recordingStrategy: 'ALL_SUPPORTED_RESOURCE_TYPES',
  region: 'eu-central-1',
  resourceType: 'AWS::Lambda::Function',
  ...overrides,
});

describe('configRecordingFrequencyRule', () => {
  it('retains Config candidates with unknown metrics without masking a proven recording dependency', () => {
    const context = {
      catalog: { indexType: 'LOCAL' as const, resources: [], searchRegion: 'eu-central-1' },
      resources: new LiveResourceBag({
        'aws-config-recording-frequency-reviews': [
          createReview({
            configurationItemsRecorded: null,
            estimatedMonthlyConfigurationItemReduction: null,
            estimatedMonthlyRecordingCostReductionUsd: null,
            turnoverEstimateReliable: false,
          }),
          createReview({
            configurationItemsRecorded: null,
            estimatedMonthlyConfigurationItemReduction: null,
            estimatedMonthlyRecordingCostReductionUsd: null,
            firewallManagerDependent: true,
            resourceType: 'AWS::EC2::Instance',
            turnoverEstimateReliable: false,
          }),
        ],
      }),
    };

    expect(configRecordingFrequencyRule.evaluateLive?.(context)).toBeNull();
    expect(configRecordingFrequencyRule.getLiveEvaluationCoverage?.(context)).toEqual({
      assessed: [
        {
          accountId: '123456789012',
          region: 'eu-central-1',
          resourceId: 'arn:aws:config:eu-central-1:123456789012:configuration-recorder/default/abc#AWS::EC2::Instance',
        },
      ],
      unknown: [
        {
          accountId: '123456789012',
          region: 'eu-central-1',
          resourceId:
            'arn:aws:config:eu-central-1:123456789012:configuration-recorder/default/abc#AWS::Lambda::Function',
        },
      ],
    });
  });

  it('recommends a targeted daily override for high-churn continuous resource types', () => {
    const finding = configRecordingFrequencyRule.evaluateLive?.({
      catalog: { indexType: 'LOCAL', resources: [], searchRegion: 'eu-central-1' },
      resources: new LiveResourceBag({
        'aws-config-recording-frequency-reviews': [createReview()],
      }),
    });

    expect(finding).toEqual({
      findings: [
        {
          accountId: '123456789012',
          region: 'eu-central-1',
          resourceId:
            'arn:aws:config:eu-central-1:123456789012:configuration-recorder/default/abc#AWS::Lambda::Function',
          impact: {
            source: 'cloudburn',
            sourceDetail: 'aws-config-recording-frequency',
            window: { lookbackDays: 14 },
            currentCost: {
              confidence: 'unknown',
              currency: 'USD',
              period: 'month',
              reason: {
                code: 'not_provided',
                message: 'The dataset does not provide normalized current recording cost.',
              },
            },
            potentialSavings: { amount: 11.06, confidence: 'estimated', currency: 'USD', period: 'month' },
          },
        },
      ],
      message:
        'Cost-inefficient AWS Config resource types should use targeted daily recording when no continuous-recording dependency applies.',
      ruleId: 'CLDBRN-AWS-CONFIG-1',
      service: 'config',
      severity: 'medium',
      source: 'discovery',
    });
  });

  it('does not recommend daily recording for a Firewall Manager dependency', () => {
    const finding = configRecordingFrequencyRule.evaluateLive?.({
      catalog: { indexType: 'LOCAL', resources: [], searchRegion: 'eu-central-1' },
      resources: new LiveResourceBag({
        'aws-config-recording-frequency-reviews': [
          createReview({
            firewallManagerDependent: true,
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('does not recommend daily recording below the monthly savings threshold', () => {
    const finding = configRecordingFrequencyRule.evaluateLive?.({
      catalog: { indexType: 'LOCAL', resources: [], searchRegion: 'eu-central-1' },
      resources: new LiveResourceBag({
        'aws-config-recording-frequency-reviews': [createReview({ estimatedMonthlyRecordingCostReductionUsd: 10 })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('does not recommend daily recording when the turnover estimate is unreliable', () => {
    const finding = configRecordingFrequencyRule.evaluateLive?.({
      catalog: { indexType: 'LOCAL', resources: [], searchRegion: 'eu-central-1' },
      resources: new LiveResourceBag({
        'aws-config-recording-frequency-reviews': [createReview({ turnoverEstimateReliable: false })],
      }),
    });

    expect(finding).toBeNull();
  });
});

describe('createAwsConfigRecordingFrequencyImpact', () => {
  it('keeps savings unknown when a dependent service requires continuous recording', () => {
    for (const overrides of [{ firewallManagerDependent: true }, { paidServiceLinkedRecorderDependent: true }]) {
      const impact = createAwsConfigRecordingFrequencyImpact(createReview(overrides));
      expect(impact.potentialSavings).toEqual({
        confidence: 'unknown',
        currency: 'USD',
        period: 'month',
        reason: {
          code: 'action_not_applicable',
          message: 'Continuous recording is required by a dependent service.',
        },
      });
      expect(Object.hasOwn(impact.potentialSavings, 'amount')).toBe(false);
    }
  });

  it('keeps savings unknown when recording or turnover evidence is incomplete', () => {
    for (const overrides of [
      { turnoverEstimateReliable: false },
      { configurationItemsRecorded: null },
      { estimatedMonthlyConfigurationItemReduction: null },
    ]) {
      const impact = createAwsConfigRecordingFrequencyImpact(createReview(overrides));
      expect(impact.potentialSavings).toEqual({
        confidence: 'unknown',
        currency: 'USD',
        period: 'month',
        reason: {
          code: 'incomplete_evidence',
          message: 'The recording or resource-turnover evidence is incomplete.',
        },
      });
      expect(Object.hasOwn(impact.potentialSavings, 'amount')).toBe(false);
    }
  });

  it('reports a null modeled amount as missing evidence, not zero', () => {
    const impact = createAwsConfigRecordingFrequencyImpact(
      createReview({ estimatedMonthlyRecordingCostReductionUsd: null }),
    );
    expect(impact.potentialSavings).toEqual({
      confidence: 'unknown',
      currency: 'USD',
      period: 'month',
      reason: { code: 'missing_amount', message: 'The source did not provide a usable amount.' },
    });
    expect(impact.currentCost.confidence).toBe('unknown');
  });

  it('omits the window when the observation period is absent', () => {
    const impact = createAwsConfigRecordingFrequencyImpact(createReview({ observationWindowDays: Number.NaN }));
    expect(Object.hasOwn(impact, 'window')).toBe(false);
    expect(Object.hasOwn(impact, 'observedAt')).toBe(false);
    expect(Object.hasOwn(impact, 'refreshedAt')).toBe(false);
  });
});
