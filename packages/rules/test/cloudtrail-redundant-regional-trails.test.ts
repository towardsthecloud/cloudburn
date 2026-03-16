import { describe, expect, it } from 'vitest';
import { cloudTrailRedundantRegionalTrailsRule } from '../src/aws/cloudtrail/redundant-regional-trails.js';
import type { AwsCloudTrailTrail } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createTrail = (overrides: Partial<AwsCloudTrailTrail> = {}): AwsCloudTrailTrail => ({
  accountId: '123456789012',
  homeRegion: 'us-east-1',
  isMultiRegionTrail: false,
  isOrganizationTrail: false,
  region: 'us-east-1',
  trailArn: 'arn:aws:cloudtrail:us-east-1:123456789012:trail/b-trail',
  trailName: 'b-trail',
  ...overrides,
});

describe('cloudTrailRedundantRegionalTrailsRule', () => {
  it('flags extra single-region trails after keeping the canonical trail per account and region', () => {
    const finding = cloudTrailRedundantRegionalTrailsRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-cloudtrail-trails': [
          createTrail({ trailArn: 'arn:aws:cloudtrail:us-east-1:123456789012:trail/a-trail', trailName: 'a-trail' }),
          createTrail(),
          createTrail({
            homeRegion: 'us-west-2',
            region: 'us-west-2',
            trailArn: 'arn:aws:cloudtrail:us-west-2:123456789012:trail/west-trail',
          }),
        ],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-CLOUDTRAIL-2',
      service: 'cloudtrail',
      source: 'discovery',
      message: 'AWS regions should keep only one single-region CloudTrail trail unless redundancy is intentional.',
      findings: [
        {
          resourceId: 'arn:aws:cloudtrail:us-east-1:123456789012:trail/b-trail',
          region: 'us-east-1',
          accountId: '123456789012',
        },
      ],
    });
  });

  it('does not flag regions with only one single-region trail', () => {
    const finding = cloudTrailRedundantRegionalTrailsRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-cloudtrail-trails': [createTrail()],
      }),
    });

    expect(finding).toBeNull();
  });

  it('ignores multi-region trails', () => {
    const finding = cloudTrailRedundantRegionalTrailsRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-cloudtrail-trails': [createTrail({ isMultiRegionTrail: true })],
      }),
    });

    expect(finding).toBeNull();
  });
});
