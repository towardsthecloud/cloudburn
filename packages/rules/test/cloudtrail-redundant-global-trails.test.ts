import { describe, expect, it } from 'vitest';
import { cloudTrailRedundantGlobalTrailsRule } from '../src/aws/cloudtrail/redundant-global-trails.js';
import type { AwsCloudTrailTrail } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createTrail = (overrides: Partial<AwsCloudTrailTrail> = {}): AwsCloudTrailTrail => ({
  accountId: '123456789012',
  homeRegion: 'us-east-1',
  isMultiRegionTrail: true,
  isOrganizationTrail: false,
  region: 'us-east-1',
  trailArn: 'arn:aws:cloudtrail:us-east-1:123456789012:trail/b-trail',
  trailName: 'b-trail',
  ...overrides,
});

describe('cloudTrailRedundantGlobalTrailsRule', () => {
  it('flags extra multi-region trails after keeping the canonical trail per account', () => {
    const finding = cloudTrailRedundantGlobalTrailsRule.evaluateLive?.({
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
            accountId: '210987654321',
            trailArn: 'arn:aws:cloudtrail:us-east-1:210987654321:trail/c-trail',
          }),
        ],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-CLOUDTRAIL-1',
      service: 'cloudtrail',
      source: 'discovery',
      message: 'AWS accounts should keep only one multi-region CloudTrail trail unless redundancy is intentional.',
      findings: [
        {
          resourceId: 'arn:aws:cloudtrail:us-east-1:123456789012:trail/b-trail',
          region: 'us-east-1',
          accountId: '123456789012',
        },
      ],
    });
  });

  it('does not flag accounts with only one multi-region trail', () => {
    const finding = cloudTrailRedundantGlobalTrailsRule.evaluateLive?.({
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

  it('ignores single-region trails', () => {
    const finding = cloudTrailRedundantGlobalTrailsRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-cloudtrail-trails': [createTrail({ isMultiRegionTrail: false })],
      }),
    });

    expect(finding).toBeNull();
  });
});
