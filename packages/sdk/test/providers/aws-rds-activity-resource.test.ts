import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';
import { hydrateAwsRdsInstances } from '../../src/providers/aws/resources/rds.js';
import {
  hydrateAwsRdsInstanceActivity,
  hydrateAwsRdsInstanceCpuMetrics,
} from '../../src/providers/aws/resources/rds-activity.js';

vi.mock('../../src/providers/aws/resources/cloudwatch.js', () => ({
  fetchCloudWatchSignals: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/rds.js', () => ({
  hydrateAwsRdsInstances: vi.fn(),
}));

const mockedFetchCloudWatchSignals = vi.mocked(fetchCloudWatchSignals);
const mockedHydrateAwsRdsInstances = vi.mocked(hydrateAwsRdsInstances);
const createDailyPoints = (count: number, value: number) =>
  Array.from({ length: count }, (_, index) => ({
    timestamp: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    value,
  }));

describe('hydrateAwsRdsInstanceActivity', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates RDS activity with 7-day max connection counts', async () => {
    mockedHydrateAwsRdsInstances.mockResolvedValue([
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'legacy-db',
        instanceClass: 'db.m6i.large',
        region: 'us-east-1',
      },
    ]);
    mockedFetchCloudWatchSignals.mockResolvedValue(new Map([['rds0', createDailyPoints(7, 0)]]));

    await expect(hydrateAwsRdsInstanceActivity([])).resolves.toEqual([
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'legacy-db',
        instanceClass: 'db.m6i.large',
        maxDatabaseConnectionsLast7Days: 0,
        region: 'us-east-1',
      },
    ]);
  });

  it('preserves unknown activity when CloudWatch returns no datapoints', async () => {
    mockedHydrateAwsRdsInstances.mockResolvedValue([
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'new-db',
        instanceClass: 'db.t4g.micro',
        region: 'us-east-1',
      },
    ]);
    mockedFetchCloudWatchSignals.mockResolvedValue(new Map());

    await expect(hydrateAwsRdsInstanceActivity([])).resolves.toEqual([
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'new-db',
        instanceClass: 'db.t4g.micro',
        maxDatabaseConnectionsLast7Days: null,
        region: 'us-east-1',
      },
    ]);
  });

  it('preserves unknown activity when CloudWatch returns partial 7-day coverage', async () => {
    mockedHydrateAwsRdsInstances.mockResolvedValue([
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'new-db',
        instanceClass: 'db.t4g.micro',
        region: 'us-east-1',
      },
    ]);
    mockedFetchCloudWatchSignals.mockResolvedValue(new Map([['rds0', createDailyPoints(6, 0)]]));

    await expect(hydrateAwsRdsInstanceActivity([])).resolves.toEqual([
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'new-db',
        instanceClass: 'db.t4g.micro',
        maxDatabaseConnectionsLast7Days: null,
        region: 'us-east-1',
      },
    ]);
  });
});

describe('hydrateAwsRdsInstanceCpuMetrics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates RDS CPU metrics with 30-day average utilization', async () => {
    mockedHydrateAwsRdsInstances.mockResolvedValue([
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'legacy-db',
        instanceClass: 'db.m6i.large',
        region: 'us-east-1',
      },
    ]);
    mockedFetchCloudWatchSignals.mockResolvedValue(new Map([['cpu0', createDailyPoints(30, 8)]]));

    await expect(hydrateAwsRdsInstanceCpuMetrics([])).resolves.toEqual([
      {
        accountId: '123456789012',
        averageCpuUtilizationLast30Days: 8,
        dbInstanceIdentifier: 'legacy-db',
        region: 'us-east-1',
      },
    ]);
  });

  it('preserves unknown CPU coverage when CloudWatch returns partial 30-day data', async () => {
    mockedHydrateAwsRdsInstances.mockResolvedValue([
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'new-db',
        instanceClass: 'db.t4g.micro',
        region: 'us-east-1',
      },
    ]);
    mockedFetchCloudWatchSignals.mockResolvedValue(new Map([['cpu0', createDailyPoints(29, 4)]]));

    await expect(hydrateAwsRdsInstanceCpuMetrics([])).resolves.toEqual([
      {
        accountId: '123456789012',
        averageCpuUtilizationLast30Days: null,
        dbInstanceIdentifier: 'new-db',
        region: 'us-east-1',
      },
    ]);
  });
});
