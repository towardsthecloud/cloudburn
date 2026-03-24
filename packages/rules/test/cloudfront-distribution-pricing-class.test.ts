import { describe, expect, it } from 'vitest';
import { cloudFrontDistributionPricingClassRule } from '../src/aws/cloudfront/distribution-pricing-class.js';
import type { AwsCloudFrontDistribution, AwsStaticCloudFrontDistribution } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const createDistribution = (overrides: Partial<AwsCloudFrontDistribution> = {}): AwsCloudFrontDistribution => ({
  accountId: '123456789012',
  distributionArn: 'arn:aws:cloudfront::123456789012:distribution/E1234567890ABC',
  distributionId: 'E1234567890ABC',
  priceClass: 'PriceClass_All',
  region: 'global',
  ...overrides,
});

const createStaticDistribution = (
  overrides: Partial<AwsStaticCloudFrontDistribution> = {},
): AwsStaticCloudFrontDistribution => ({
  resourceId: 'aws_cloudfront_distribution.cdn',
  priceClass: 'PriceClass_All',
  ...overrides,
});

describe('cloudFrontDistributionPricingClassRule', () => {
  it('flags distributions using PriceClass_All', () => {
    const finding = cloudFrontDistributionPricingClassRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-cloudfront-distributions': [createDistribution()],
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

  it('skips distributions already using a narrower price class', () => {
    const finding = cloudFrontDistributionPricingClassRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-cloudfront-distributions': [createDistribution({ priceClass: 'PriceClass_100' })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('flags static distributions using PriceClass_All', () => {
    const finding = cloudFrontDistributionPricingClassRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-cloudfront-distributions': [createStaticDistribution()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        resourceId: 'aws_cloudfront_distribution.cdn',
      },
    ]);
  });

  it('skips static distributions with a narrower or unknown price class', () => {
    const narrowerFinding = cloudFrontDistributionPricingClassRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-cloudfront-distributions': [createStaticDistribution({ priceClass: 'PriceClass_100' })],
      }),
    });
    const unknownFinding = cloudFrontDistributionPricingClassRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-cloudfront-distributions': [createStaticDistribution({ priceClass: null })],
      }),
    });

    expect(narrowerFinding).toBeNull();
    expect(unknownFinding).toBeNull();
  });
});
