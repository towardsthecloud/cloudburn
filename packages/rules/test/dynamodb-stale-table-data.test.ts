import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dynamoDbStaleTableDataRule } from '../src/aws/dynamodb/stale-table-data.js';
import type { AwsDynamoDbTable } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createTable = (overrides: Partial<AwsDynamoDbTable> = {}): AwsDynamoDbTable => ({
  accountId: '123456789012',
  billingMode: 'PROVISIONED',
  latestStreamLabel: '2025-12-01T00:00:00.000',
  region: 'us-east-1',
  tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
  tableName: 'orders',
  ...overrides,
});

describe('dynamoDbStaleTableDataRule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flags tables whose latest stream label is older than 90 days', () => {
    const finding = dynamoDbStaleTableDataRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-dynamodb-tables': [createTable()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        resourceId: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
      },
    ]);
  });

  it('skips tables with recent or unavailable stream labels', () => {
    const finding = dynamoDbStaleTableDataRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-dynamodb-tables': [
          createTable({ latestStreamLabel: '2026-03-01T00:00:00.000' }),
          createTable({
            latestStreamLabel: undefined,
            tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/audit',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
