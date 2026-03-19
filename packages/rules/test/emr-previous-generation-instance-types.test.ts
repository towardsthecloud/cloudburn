import { describe, expect, it } from 'vitest';
import { emrPreviousGenerationInstanceTypeRule } from '../src/aws/emr/previous-generation-instance-types.js';
import type { AwsEmrCluster } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createCluster = (overrides: Partial<AwsEmrCluster> = {}): AwsEmrCluster => ({
  accountId: '123456789012',
  clusterId: 'j-CLUSTER1',
  clusterName: 'analytics',
  instanceTypes: ['m6i.xlarge'],
  normalizedInstanceHours: 240,
  readyDateTime: '2026-03-01T00:00:00.000Z',
  region: 'us-east-1',
  state: 'RUNNING',
  ...overrides,
});

describe('emrPreviousGenerationInstanceTypeRule', () => {
  it('flags EMR clusters that still use previous-generation instance types', () => {
    const finding = emrPreviousGenerationInstanceTypeRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-emr-clusters': [createCluster()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EMR-1',
      service: 'emr',
      source: 'discovery',
      message: 'EMR clusters using previous-generation instance types should be reviewed.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'j-CLUSTER1',
        },
      ],
    });
  });

  it('skips clusters that only use current-generation instance families', () => {
    const finding = emrPreviousGenerationInstanceTypeRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-emr-clusters': [createCluster({ instanceTypes: ['m8g.xlarge', 'r8g.2xlarge'] })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips ended clusters even when they previously used previous-generation instance types', () => {
    const finding = emrPreviousGenerationInstanceTypeRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-emr-clusters': [
          createCluster({
            clusterId: 'j-ENDED',
            endDateTime: '2026-03-10T00:00:00.000Z',
            instanceTypes: ['m6i.xlarge'],
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
