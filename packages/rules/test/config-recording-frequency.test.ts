import { describe, expect, it } from 'vitest';
import { configRecordingFrequencyRule } from '../src/aws/config/recording-frequency.js';
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
  it('recommends a targeted daily override for high-churn continuous resource types', () => {
    const finding = configRecordingFrequencyRule.evaluateLive?.({
      catalog: { indexType: 'LOCAL', resources: [], searchRegion: 'eu-central-1' },
      resources: new LiveResourceBag({
        'aws-config-recording-frequency-reviews': [createReview()],
      }),
    });

    expect(configRecordingFrequencyRule.discoveryDependencies).toEqual(['aws-config-recording-frequency-reviews']);
    expect(finding).toEqual({
      findings: [
        {
          accountId: '123456789012',
          region: 'eu-central-1',
          resourceId:
            'arn:aws:config:eu-central-1:123456789012:configuration-recorder/default/abc#AWS::Lambda::Function',
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
});
