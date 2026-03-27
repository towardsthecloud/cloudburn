import { describe, expect, it } from 'vitest';
import { rdsPerformanceInsightsExtendedRetentionRule } from '../src/aws/rds/performance-insights-extended-retention.js';
import type { AwsStaticRdsInstance } from '../src/index.js';
import { StaticResourceBag } from '../src/index.js';

const createInstance = (overrides: Partial<AwsStaticRdsInstance> = {}): AwsStaticRdsInstance => ({
  engine: 'postgres',
  engineVersion: '16.1',
  instanceClass: 'db.r7g.large',
  location: {
    path: 'main.tf',
    line: 4,
    column: 3,
  },
  performanceInsightsEnabled: true,
  performanceInsightsRetentionPeriod: 93,
  resourceId: 'aws_db_instance.app',
  ...overrides,
});

describe('rdsPerformanceInsightsExtendedRetentionRule', () => {
  it('flags Performance Insights retention beyond the included 7-day period', () => {
    const finding = rdsPerformanceInsightsExtendedRetentionRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-rds-instances': [createInstance()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-RDS-8',
      service: 'rds',
      source: 'iac',
      message: 'RDS Performance Insights should use the included 7-day retention unless longer retention is required.',
      findings: [
        {
          location: {
            path: 'main.tf',
            line: 4,
            column: 3,
          },
          resourceId: 'aws_db_instance.app',
        },
      ],
    });
  });

  it('skips disabled insights, default retention, or unresolved retention', () => {
    const finding = rdsPerformanceInsightsExtendedRetentionRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-rds-instances': [
          createInstance({ performanceInsightsEnabled: false }),
          createInstance({ resourceId: 'DefaultRetention', performanceInsightsRetentionPeriod: undefined }),
          createInstance({ resourceId: 'UnknownRetention', performanceInsightsRetentionPeriod: null }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
