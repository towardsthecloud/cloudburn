import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sagemakerIdleEndpointRule } from '../src/aws/sagemaker/idle-endpoint.js';
import type { AwsSageMakerEndpointActivity } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createEndpoint = (overrides: Partial<AwsSageMakerEndpointActivity> = {}): AwsSageMakerEndpointActivity => ({
  accountId: '123456789012',
  creationTime: '2025-12-01T00:00:00.000Z',
  endpointArn: 'arn:aws:sagemaker:eu-west-1:123456789012:endpoint/orders-endpoint',
  endpointConfigName: 'orders-endpoint-config',
  endpointName: 'orders-endpoint',
  endpointStatus: 'InService',
  lastModifiedTime: '2025-12-15T00:00:00.000Z',
  region: 'eu-west-1',
  totalInvocationsLast14Days: 0,
  ...overrides,
});

describe('sagemakerIdleEndpointRule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flags InService endpoints older than 14 days with zero invocations', () => {
    const finding = sagemakerIdleEndpointRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'eu-west-1',
      },
      resources: new LiveResourceBag({
        'aws-sagemaker-endpoint-activity': [createEndpoint()],
      }),
    });

    expect(finding).toEqual({
      findings: [
        {
          accountId: '123456789012',
          region: 'eu-west-1',
          resourceId: 'orders-endpoint',
        },
      ],
      message: 'SageMaker endpoints in service with zero invocations over 14 days should be reviewed for cleanup.',
      ruleId: 'CLDBRN-AWS-SAGEMAKER-2',
      service: 'sagemaker',
      source: 'discovery',
    });
  });

  it('skips endpoints that are too new, not in service, or have traffic', () => {
    const finding = sagemakerIdleEndpointRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'eu-west-1',
      },
      resources: new LiveResourceBag({
        'aws-sagemaker-endpoint-activity': [
          createEndpoint({
            endpointName: 'active-endpoint',
            totalInvocationsLast14Days: 12,
          }),
          createEndpoint({
            creationTime: '2025-12-25T00:00:00.000Z',
            endpointName: 'new-endpoint',
          }),
          createEndpoint({
            endpointName: 'updating-endpoint',
            endpointStatus: 'Updating',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips endpoints with incomplete metrics or missing creation time', () => {
    const finding = sagemakerIdleEndpointRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'eu-west-1',
      },
      resources: new LiveResourceBag({
        'aws-sagemaker-endpoint-activity': [
          createEndpoint({
            endpointName: 'missing-metrics',
            totalInvocationsLast14Days: null,
          }),
          createEndpoint({
            creationTime: undefined,
            endpointName: 'unknown-age',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
