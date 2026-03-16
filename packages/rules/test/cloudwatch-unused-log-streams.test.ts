import { describe, expect, it } from 'vitest';
import { cloudWatchUnusedLogStreamsRule } from '../src/aws/cloudwatch/unused-log-streams.js';
import type { AwsCloudWatchLogGroup, AwsCloudWatchLogStream } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createLogGroup = (overrides: Partial<AwsCloudWatchLogGroup> = {}): AwsCloudWatchLogGroup => ({
  accountId: '123456789012',
  logGroupArn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
  logGroupName: '/aws/lambda/app',
  region: 'us-east-1',
  ...overrides,
});

const createLogStream = (overrides: Partial<AwsCloudWatchLogStream> = {}): AwsCloudWatchLogStream => ({
  accountId: '123456789012',
  arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app:log-stream:2026/03/16/[$LATEST]abc',
  logGroupName: '/aws/lambda/app',
  logStreamName: '2026/03/16/[$LATEST]abc',
  region: 'us-east-1',
  ...overrides,
});

describe('cloudWatchUnusedLogStreamsRule', () => {
  it('flags log streams with no event history', () => {
    const finding = cloudWatchUnusedLogStreamsRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [createLogGroup()],
        'aws-cloudwatch-log-streams': [createLogStream()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-CLOUDWATCH-2',
      service: 'cloudwatch',
      source: 'discovery',
      message: 'CloudWatch log streams that have never received events should be removed.',
      findings: [
        {
          resourceId:
            'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app:log-stream:2026/03/16/[$LATEST]abc',
          region: 'us-east-1',
          accountId: '123456789012',
        },
      ],
    });
  });

  it('does not flag log streams with observed event history', () => {
    const finding = cloudWatchUnusedLogStreamsRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [createLogGroup()],
        'aws-cloudwatch-log-streams': [createLogStream({ lastEventTimestamp: 1_710_000_000_000 })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('does not flag streams inside delivery-managed log groups', () => {
    const finding = cloudWatchUnusedLogStreamsRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [createLogGroup({ logGroupClass: 'DELIVERY' })],
        'aws-cloudwatch-log-streams': [createLogStream()],
      }),
    });

    expect(finding).toBeNull();
  });

  it('does not flag streams when log-group metadata is unavailable', () => {
    const finding = cloudWatchUnusedLogStreamsRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [],
        'aws-cloudwatch-log-streams': [createLogStream()],
      }),
    });

    expect(finding).toBeNull();
  });

  it('scopes delivery-managed exemptions by region and account', () => {
    const finding = cloudWatchUnusedLogStreamsRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'AGGREGATOR',
      },
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [
          createLogGroup(),
          createLogGroup({
            accountId: '123456789012',
            logGroupArn: 'arn:aws:logs:us-west-2:123456789012:log-group:/aws/lambda/app',
            logGroupClass: 'DELIVERY',
            region: 'us-west-2',
          }),
          createLogGroup({
            accountId: '210987654321',
            logGroupArn: 'arn:aws:logs:us-east-1:210987654321:log-group:/aws/lambda/app',
            logGroupClass: 'DELIVERY',
          }),
        ],
        'aws-cloudwatch-log-streams': [createLogStream()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        resourceId: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app:log-stream:2026/03/16/[$LATEST]abc',
        region: 'us-east-1',
        accountId: '123456789012',
      },
    ]);
  });
});
