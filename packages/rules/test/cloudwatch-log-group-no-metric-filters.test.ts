import { describe, expect, it } from 'vitest';
import { cloudWatchLogGroupNoMetricFiltersRule } from '../src/aws/cloudwatch/log-group-no-metric-filters.js';
import type { AwsCloudWatchLogGroup, AwsCloudWatchLogMetricFilterCoverage } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createLogGroup = (overrides: Partial<AwsCloudWatchLogGroup> = {}): AwsCloudWatchLogGroup => ({
  accountId: '123456789012',
  logGroupArn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
  logGroupName: '/aws/lambda/app',
  region: 'us-east-1',
  storedBytes: 2_147_483_648,
  ...overrides,
});

const createMetricFilterCoverage = (
  overrides: Partial<AwsCloudWatchLogMetricFilterCoverage> = {},
): AwsCloudWatchLogMetricFilterCoverage => ({
  accountId: '123456789012',
  logGroupName: '/aws/lambda/app',
  metricFilterCount: 0,
  region: 'us-east-1',
  ...overrides,
});

describe('cloudWatchLogGroupNoMetricFiltersRule', () => {
  it('flags 1 GB+ log groups with zero metric filters', () => {
    const finding = cloudWatchLogGroupNoMetricFiltersRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [createLogGroup()],
        'aws-cloudwatch-log-metric-filter-coverage': [createMetricFilterCoverage()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-CLOUDWATCH-3',
      service: 'cloudwatch',
      source: 'discovery',
      message:
        'CloudWatch log groups storing at least 1 GB should define metric filters or reduce retention aggressively.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: '/aws/lambda/app',
        },
      ],
    });
  });

  it('skips smaller log groups', () => {
    const finding = cloudWatchLogGroupNoMetricFiltersRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [createLogGroup({ storedBytes: 1_073_741_823 })],
        'aws-cloudwatch-log-metric-filter-coverage': [createMetricFilterCoverage()],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips log groups with metric filters', () => {
    const finding = cloudWatchLogGroupNoMetricFiltersRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [createLogGroup()],
        'aws-cloudwatch-log-metric-filter-coverage': [createMetricFilterCoverage({ metricFilterCount: 2 })],
      }),
    });

    expect(finding).toBeNull();
  });
});
