import { describe, expect, it } from 'vitest';
import { cloudWatchLogGroupRetentionRule } from '../src/aws/cloudwatch/log-group-retention.js';
import type { AwsCloudWatchLogGroup } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createLogGroup = (overrides: Partial<AwsCloudWatchLogGroup> = {}): AwsCloudWatchLogGroup => ({
  accountId: '123456789012',
  logGroupArn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
  logGroupName: '/aws/lambda/app',
  region: 'us-east-1',
  ...overrides,
});

describe('cloudWatchLogGroupRetentionRule', () => {
  it('flags log groups without retention configured', () => {
    const finding = cloudWatchLogGroupRetentionRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [createLogGroup()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-CLOUDWATCH-1',
      service: 'cloudwatch',
      source: 'discovery',
      message: 'CloudWatch log groups should define a retention policy unless AWS manages lifecycle automatically.',
      findings: [
        {
          resourceId: '/aws/lambda/app',
          region: 'us-east-1',
          accountId: '123456789012',
        },
      ],
    });
  });

  it('does not flag log groups with retention configured', () => {
    const finding = cloudWatchLogGroupRetentionRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [createLogGroup({ retentionInDays: 30 })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('does not flag delivery-managed log groups', () => {
    const finding = cloudWatchLogGroupRetentionRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [createLogGroup({ logGroupClass: 'DELIVERY' })],
      }),
    });

    expect(finding).toBeNull();
  });
});
