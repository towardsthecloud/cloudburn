import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloudWatchUnusedLogStreamsRule } from '../src/aws/cloudwatch/unused-log-streams.js';
import type { AwsCloudWatchLogGroup, AwsCloudWatchLogGroupRecentStreamActivity } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const createLogGroup = (overrides: Partial<AwsCloudWatchLogGroup> = {}): AwsCloudWatchLogGroup => ({
  accountId: '123456789012',
  logGroupArn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
  logGroupName: '/aws/lambda/app',
  region: 'us-east-1',
  ...overrides,
});

const createRecentActivity = (
  overrides: Partial<AwsCloudWatchLogGroupRecentStreamActivity> = {},
): AwsCloudWatchLogGroupRecentStreamActivity => ({
  accountId: '123456789012',
  logGroupName: '/aws/lambda/app',
  latestStreamArn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app:log-stream:2026/03/16/[$LATEST]abc',
  latestStreamName: '2026/03/16/[$LATEST]abc',
  region: 'us-east-1',
  ...overrides,
});

describe('cloudWatchUnusedLogStreamsRule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-19T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flags log groups whose latest stream has no event history', () => {
    const finding = cloudWatchUnusedLogStreamsRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [createLogGroup()],
        'aws-cloudwatch-log-group-recent-stream-activity': [createRecentActivity()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-CLOUDWATCH-2',
      service: 'cloudwatch',
      source: 'discovery',
      message:
        'CloudWatch log groups whose most recent stream activity is older than 90 days should be reviewed or removed.',
      findings: [
        {
          resourceId: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
          region: 'us-east-1',
          accountId: '123456789012',
        },
      ],
    });
  });

  it('flags log groups whose latest stream activity was more than 90 days ago', () => {
    const finding = cloudWatchUnusedLogStreamsRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [createLogGroup()],
        'aws-cloudwatch-log-group-recent-stream-activity': [
          createRecentActivity({ lastIngestionTime: Date.now() - 91 * DAY_MS }),
        ],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        resourceId: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
        region: 'us-east-1',
        accountId: '123456789012',
      },
    ]);
  });

  it('does not flag log groups with recent observed stream activity', () => {
    const finding = cloudWatchUnusedLogStreamsRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [createLogGroup()],
        'aws-cloudwatch-log-group-recent-stream-activity': [
          createRecentActivity({ lastEventTimestamp: 1_770_000_000_000 }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('does not flag log groups whose latest stream ingestion was within 90 days', () => {
    const finding = cloudWatchUnusedLogStreamsRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [createLogGroup()],
        'aws-cloudwatch-log-group-recent-stream-activity': [
          createRecentActivity({ lastIngestionTime: Date.now() - 30 * DAY_MS }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('does not flag log groups whose latest stream activity was exactly 90 days ago', () => {
    const finding = cloudWatchUnusedLogStreamsRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [createLogGroup()],
        'aws-cloudwatch-log-group-recent-stream-activity': [
          createRecentActivity({ lastIngestionTime: Date.now() - 90 * DAY_MS }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('does not flag delivery-managed log groups even when their latest stream is stale', () => {
    const finding = cloudWatchUnusedLogStreamsRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [createLogGroup({ logGroupClass: 'DELIVERY' })],
        'aws-cloudwatch-log-group-recent-stream-activity': [createRecentActivity()],
      }),
    });

    expect(finding).toBeNull();
  });

  it('does not flag activity summaries when log-group metadata is unavailable', () => {
    const finding = cloudWatchUnusedLogStreamsRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [],
        'aws-cloudwatch-log-group-recent-stream-activity': [createRecentActivity()],
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
        'aws-cloudwatch-log-group-recent-stream-activity': [createRecentActivity()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        resourceId: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
        region: 'us-east-1',
        accountId: '123456789012',
      },
    ]);
  });

  it('flags log groups when no streams exist yet', () => {
    const finding = cloudWatchUnusedLogStreamsRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [createLogGroup()],
        'aws-cloudwatch-log-group-recent-stream-activity': [],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        resourceId: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
        region: 'us-east-1',
        accountId: '123456789012',
      },
    ]);
  });
});
