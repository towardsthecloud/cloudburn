import { describe, expect, it } from 'vitest';
import { cloudFrontUnusedDistributionRule } from '../src/aws/cloudfront/unused-distribution.js';
import type { AwsCloudFrontDistributionRequestActivity } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createActivity = (
  overrides: Partial<AwsCloudFrontDistributionRequestActivity> = {},
): AwsCloudFrontDistributionRequestActivity => ({
  accountId: '123456789012',
  distributionArn: 'arn:aws:cloudfront::123456789012:distribution/E1234567890ABC',
  distributionId: 'E1234567890ABC',
  region: 'global',
  totalRequestsLast30Days: 99,
  ...overrides,
});

describe('cloudFrontUnusedDistributionRule', () => {
  it('flags distributions with fewer than 100 requests over the last 30 days', () => {
    const finding = cloudFrontUnusedDistributionRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-cloudfront-distribution-request-activity': [createActivity()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        region: 'global',
        resourceId: 'arn:aws:cloudfront::123456789012:distribution/E1234567890ABC',
      },
    ]);
  });

  it('skips distributions with incomplete metric coverage', () => {
    const finding = cloudFrontUnusedDistributionRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-cloudfront-distribution-request-activity': [createActivity({ totalRequestsLast30Days: null })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips distributions with at least 100 requests over the last 30 days', () => {
    const finding = cloudFrontUnusedDistributionRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-cloudfront-distribution-request-activity': [createActivity({ totalRequestsLast30Days: 100 })],
      }),
    });

    expect(finding).toBeNull();
  });
});
