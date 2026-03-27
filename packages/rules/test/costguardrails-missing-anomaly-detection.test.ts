import { describe, expect, it } from 'vitest';
import { costGuardrailMissingAnomalyDetectionRule } from '../src/aws/costguardrails/missing-anomaly-detection.js';
import type { AwsCostAnomalyMonitor } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createMonitor = (overrides: Partial<AwsCostAnomalyMonitor> = {}): AwsCostAnomalyMonitor => ({
  accountId: '123456789012',
  monitorCount: 1,
  ...overrides,
});

describe('costGuardrailMissingAnomalyDetectionRule', () => {
  it('emits an account-level finding when no anomaly monitors exist', () => {
    const finding = costGuardrailMissingAnomalyDetectionRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-cost-anomaly-monitors': [createMonitor({ monitorCount: 0 })],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-COSTGUARDRAILS-2',
      service: 'costguardrails',
      source: 'discovery',
      message: 'AWS accounts should enable Cost Anomaly Detection monitors for spend spikes.',
      findings: [
        {
          accountId: '123456789012',
          resourceId: '123456789012',
        },
      ],
    });
  });

  it('skips accounts that already have anomaly monitors', () => {
    const finding = costGuardrailMissingAnomalyDetectionRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-cost-anomaly-monitors': [createMonitor()],
      }),
    });

    expect(finding).toBeNull();
  });
});
