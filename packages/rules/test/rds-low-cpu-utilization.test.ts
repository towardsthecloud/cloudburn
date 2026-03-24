import { describe, expect, it } from 'vitest';
import { rdsLowCpuUtilizationRule } from '../src/aws/rds/low-cpu-utilization.js';
import type { AwsRdsInstance, AwsRdsInstanceCpuMetric } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createInstance = (overrides: Partial<AwsRdsInstance> = {}): AwsRdsInstance => ({
  accountId: '123456789012',
  dbInstanceIdentifier: 'prod-db',
  dbInstanceStatus: 'available',
  engine: 'mysql',
  engineVersion: '8.0.39',
  instanceClass: 'db.m6i.large',
  instanceCreateTime: '2025-01-01T00:00:00.000Z',
  multiAz: false,
  region: 'us-east-1',
  ...overrides,
});

const createMetric = (overrides: Partial<AwsRdsInstanceCpuMetric> = {}): AwsRdsInstanceCpuMetric => ({
  accountId: '123456789012',
  averageCpuUtilizationLast30Days: 8,
  dbInstanceIdentifier: 'prod-db',
  region: 'us-east-1',
  ...overrides,
});

describe('rdsLowCpuUtilizationRule', () => {
  it('flags available RDS instances with 30-day average CPU at or below 10 percent', () => {
    const finding = rdsLowCpuUtilizationRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance()],
        'aws-rds-instance-cpu-metrics': [createMetric()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        resourceId: 'prod-db',
      },
    ]);
  });

  it('skips RDS instances whose CPU average stays above 10 percent', () => {
    const finding = rdsLowCpuUtilizationRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance()],
        'aws-rds-instance-cpu-metrics': [createMetric({ averageCpuUtilizationLast30Days: 12 })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips RDS instances when CPU coverage is incomplete', () => {
    const finding = rdsLowCpuUtilizationRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance()],
        'aws-rds-instance-cpu-metrics': [createMetric({ averageCpuUtilizationLast30Days: null })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('matches CPU metrics by account and region when duplicate instance identifiers exist', () => {
    const finding = rdsLowCpuUtilizationRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [
          createInstance(),
          createInstance({
            accountId: '210987654321',
            region: 'us-west-2',
          }),
        ],
        'aws-rds-instance-cpu-metrics': [
          createMetric(),
          createMetric({
            accountId: '210987654321',
            averageCpuUtilizationLast30Days: 15,
            region: 'us-west-2',
          }),
        ],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        resourceId: 'prod-db',
      },
    ]);
  });
});
