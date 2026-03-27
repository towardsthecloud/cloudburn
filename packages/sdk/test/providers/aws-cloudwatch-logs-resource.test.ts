import type {
  DescribeLogGroupsCommand,
  DescribeLogStreamsCommand,
  DescribeMetricFiltersCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudWatchLogsClient } from '../../src/providers/aws/client.js';
import {
  hydrateAwsCloudWatchLogGroups,
  hydrateAwsCloudWatchLogMetricFilterCoverage,
  hydrateAwsCloudWatchLogStreams,
} from '../../src/providers/aws/resources/cloudwatch-logs.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createCloudWatchLogsClient: vi.fn(),
}));

const mockedCreateCloudWatchLogsClient = vi.mocked(createCloudWatchLogsClient);

describe('hydrateAwsCloudWatchLogGroups', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates discovered log groups through paginated DescribeLogGroups calls', async () => {
    mockedCreateCloudWatchLogsClient.mockReturnValue({
      send: vi.fn(async (command: DescribeLogGroupsCommand) => {
        const input = command.input as { nextToken?: string };

        if (input.nextToken === undefined) {
          return {
            logGroups: [
              {
                arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/ignored',
                logGroupName: '/aws/ignored',
              },
            ],
            nextToken: 'page-2',
          };
        }

        return {
          logGroups: [
            {
              arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
              logGroupClass: 'STANDARD',
              logGroupName: '/aws/lambda/app',
              retentionInDays: 30,
              storedBytes: 2048,
            },
          ],
        };
      }),
    } as never);

    const logGroups = await hydrateAwsCloudWatchLogGroups([
      {
        accountId: '123456789012',
        arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
        properties: [],
        region: 'us-east-1',
        resourceType: 'logs:log-group',
        service: 'logs',
      },
    ]);

    expect(logGroups).toEqual([
      {
        accountId: '123456789012',
        logGroupArn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
        logGroupClass: 'STANDARD',
        logGroupName: '/aws/lambda/app',
        region: 'us-east-1',
        retentionInDays: 30,
        storedBytes: 2048,
      },
    ]);
  });

  it('stops paginating once all desired log groups are hydrated', async () => {
    const send = vi.fn(async (_command: DescribeLogGroupsCommand) => ({
      logGroups: [
        {
          arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
          logGroupClass: 'STANDARD',
          logGroupName: '/aws/lambda/app',
        },
      ],
      nextToken: 'page-2',
    }));

    mockedCreateCloudWatchLogsClient.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsCloudWatchLogGroups([
        {
          accountId: '123456789012',
          arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
          properties: [],
          region: 'us-east-1',
          resourceType: 'logs:log-group',
          service: 'logs',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        logGroupArn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
        logGroupClass: 'STANDARD',
        logGroupName: '/aws/lambda/app',
        region: 'us-east-1',
        retentionInDays: undefined,
        storedBytes: undefined,
      },
    ]);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('derives the hydrated account id from the returned log-group arn', async () => {
    mockedCreateCloudWatchLogsClient.mockReturnValue({
      send: vi.fn(async (_command: DescribeLogGroupsCommand) => ({
        logGroups: [
          {
            arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
            logGroupClass: 'STANDARD',
            logGroupName: '/aws/lambda/app',
          },
        ],
      })),
    } as never);

    await expect(
      hydrateAwsCloudWatchLogGroups([
        {
          accountId: '210987654321',
          arn: 'arn:aws:logs:us-east-1:210987654321:log-group:/aws/lambda/app',
          properties: [],
          region: 'us-east-1',
          resourceType: 'logs:log-group',
          service: 'logs',
        },
        {
          accountId: '123456789012',
          arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
          properties: [],
          region: 'us-east-1',
          resourceType: 'logs:log-group',
          service: 'logs',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        logGroupArn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
        logGroupClass: 'STANDARD',
        logGroupName: '/aws/lambda/app',
        region: 'us-east-1',
        retentionInDays: undefined,
        storedBytes: undefined,
      },
    ]);
  });

  it('preserves CloudWatch Logs error identity when log-group hydration is access denied', async () => {
    mockedCreateCloudWatchLogsClient.mockReturnValue({
      send: vi.fn().mockRejectedValue(
        Object.assign(new Error('User is not authorized to perform: logs:DescribeLogGroups'), {
          name: 'AccessDeniedException',
          code: 'AccessDeniedException',
          $metadata: {
            httpStatusCode: 403,
            requestId: 'request-logs',
          },
        }),
      ),
    } as never);

    const error = await hydrateAwsCloudWatchLogGroups([
      {
        accountId: '123456789012',
        arn: 'arn:aws:logs:eu-central-1:123456789012:log-group:/aws/lambda/app',
        properties: [],
        region: 'eu-central-1',
        resourceType: 'logs:log-group',
        service: 'logs',
      },
    ]).catch((err) => err);

    expect(error).toMatchObject({
      code: 'AccessDeniedException',
      name: 'AccessDeniedException',
    });
    expect((error as Error).message).toBe(
      'Amazon CloudWatch Logs DescribeLogGroups failed in eu-central-1 with AccessDeniedException: User is not authorized to perform: logs:DescribeLogGroups Request ID: request-logs.',
    );
  });
});

describe('hydrateAwsCloudWatchLogStreams', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates discovered log streams through paginated DescribeLogStreams calls', async () => {
    mockedCreateCloudWatchLogsClient.mockReturnValue({
      send: vi.fn(async (command: DescribeLogStreamsCommand) => {
        const input = command.input as { logGroupName?: string; nextToken?: string };

        if (input.nextToken === undefined) {
          return {
            logStreams: [],
            nextToken: 'page-2',
          };
        }

        return {
          logStreams: [
            {
              arn: `arn:aws:logs:us-east-1:123456789012:log-group:${input.logGroupName}:log-stream:2026/03/16/[$LATEST]abc`,
              lastIngestionTime: 1_710_000_000_000,
              logStreamName: '2026/03/16/[$LATEST]abc',
            },
          ],
        };
      }),
    } as never);

    const logStreams = await hydrateAwsCloudWatchLogStreams([
      {
        accountId: '123456789012',
        arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
        properties: [],
        region: 'us-east-1',
        resourceType: 'logs:log-group',
        service: 'logs',
      },
    ]);

    expect(logStreams).toEqual([
      {
        accountId: '123456789012',
        arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app:log-stream:2026/03/16/[$LATEST]abc',
        creationTime: undefined,
        firstEventTimestamp: undefined,
        lastEventTimestamp: undefined,
        lastIngestionTime: 1_710_000_000_000,
        logGroupName: '/aws/lambda/app',
        logStreamName: '2026/03/16/[$LATEST]abc',
        region: 'us-east-1',
      },
    ]);
  });

  it('derives the hydrated account id from the returned log-stream arn', async () => {
    mockedCreateCloudWatchLogsClient.mockReturnValue({
      send: vi.fn(async (command: DescribeLogStreamsCommand) => {
        const input = command.input as { logGroupName?: string };

        return {
          logStreams: [
            {
              arn: `arn:aws:logs:us-east-1:123456789012:log-group:${input.logGroupName}:log-stream:2026/03/16/[$LATEST]abc`,
              logStreamName: '2026/03/16/[$LATEST]abc',
            },
          ],
        };
      }),
    } as never);

    await expect(
      hydrateAwsCloudWatchLogStreams([
        {
          accountId: '210987654321',
          arn: 'arn:aws:logs:us-east-1:210987654321:log-group:/aws/lambda/app',
          properties: [],
          region: 'us-east-1',
          resourceType: 'logs:log-group',
          service: 'logs',
        },
        {
          accountId: '123456789012',
          arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
          properties: [],
          region: 'us-east-1',
          resourceType: 'logs:log-group',
          service: 'logs',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app:log-stream:2026/03/16/[$LATEST]abc',
        creationTime: undefined,
        firstEventTimestamp: undefined,
        lastEventTimestamp: undefined,
        lastIngestionTime: undefined,
        logGroupName: '/aws/lambda/app',
        logStreamName: '2026/03/16/[$LATEST]abc',
        region: 'us-east-1',
      },
    ]);
  });

  it('preserves CloudWatch Logs error identity when log-stream hydration is access denied', async () => {
    mockedCreateCloudWatchLogsClient.mockReturnValue({
      send: vi.fn().mockRejectedValue(
        Object.assign(new Error('User is not authorized to perform: logs:DescribeLogStreams'), {
          name: 'AccessDeniedException',
          code: 'AccessDeniedException',
          $metadata: {
            httpStatusCode: 403,
            requestId: 'request-streams',
          },
        }),
      ),
    } as never);

    const error = await hydrateAwsCloudWatchLogStreams([
      {
        accountId: '123456789012',
        arn: 'arn:aws:logs:eu-central-1:123456789012:log-group:/aws/lambda/app',
        properties: [],
        region: 'eu-central-1',
        resourceType: 'logs:log-group',
        service: 'logs',
      },
    ]).catch((err) => err);

    expect(error).toMatchObject({
      code: 'AccessDeniedException',
      name: 'AccessDeniedException',
    });
    expect((error as Error).message).toBe(
      'Amazon CloudWatch Logs DescribeLogStreams failed in eu-central-1 with AccessDeniedException: User is not authorized to perform: logs:DescribeLogStreams Request ID: request-streams.',
    );
  });
});

describe('hydrateAwsCloudWatchLogMetricFilterCoverage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates discovered log groups with metric filter counts', async () => {
    mockedCreateCloudWatchLogsClient.mockReturnValue({
      send: vi.fn(async (command: DescribeMetricFiltersCommand) => {
        const input = command.input as { filterNamePrefix?: string; logGroupName?: string; nextToken?: string };

        expect(input.filterNamePrefix).toBeUndefined();

        if (input.nextToken === undefined) {
          return {
            metricFilters: [{ filterName: 'errors' }],
            nextToken: 'page-2',
          };
        }

        return {
          metricFilters: [{ filterName: 'warnings' }],
        };
      }),
    } as never);

    await expect(
      hydrateAwsCloudWatchLogMetricFilterCoverage([
        {
          accountId: '123456789012',
          arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
          properties: [],
          region: 'us-east-1',
          resourceType: 'logs:log-group',
          service: 'logs',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        logGroupName: '/aws/lambda/app',
        metricFilterCount: 2,
        region: 'us-east-1',
      },
    ]);
  });

  it('preserves CloudWatch Logs error identity when metric-filter hydration is access denied', async () => {
    mockedCreateCloudWatchLogsClient.mockReturnValue({
      send: vi.fn().mockRejectedValue(
        Object.assign(new Error('User is not authorized to perform: logs:DescribeMetricFilters'), {
          name: 'AccessDeniedException',
          code: 'AccessDeniedException',
          $metadata: {
            httpStatusCode: 403,
            requestId: 'request-metric-filters',
          },
        }),
      ),
    } as never);

    const error = await hydrateAwsCloudWatchLogMetricFilterCoverage([
      {
        accountId: '123456789012',
        arn: 'arn:aws:logs:eu-central-1:123456789012:log-group:/aws/lambda/app',
        properties: [],
        region: 'eu-central-1',
        resourceType: 'logs:log-group',
        service: 'logs',
      },
    ]).catch((err) => err);

    expect(error).toMatchObject({
      code: 'AccessDeniedException',
      name: 'AccessDeniedException',
    });
    expect((error as Error).message).toBe(
      'Amazon CloudWatch Logs DescribeMetricFilters failed in eu-central-1 with AccessDeniedException: User is not authorized to perform: logs:DescribeMetricFilters Request ID: request-metric-filters.',
    );
  });
});
