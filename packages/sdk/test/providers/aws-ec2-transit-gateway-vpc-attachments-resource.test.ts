import {
  DescribeTransitGatewayAttachmentsCommand,
  type TransitGatewayAttachment,
  type TransitGatewayVpcAttachment,
} from '@aws-sdk/client-ec2';
import { STSClient } from '@aws-sdk/client-sts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryEvidenceCacheStore } from '../../src/evidence-cache.js';
import { createEc2Client, withAwsClientCredentials } from '../../src/providers/aws/client.js';
import { withAwsEvidenceCache } from '../../src/providers/aws/evidence.js';
import { withAwsDiscoveryExecution } from '../../src/providers/aws/execution.js';
import { fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';
import { hydrateAwsEc2TransitGatewayVpcAttachmentActivity } from '../../src/providers/aws/resources/ec2-transit-gateway-vpc-attachments.js';
import { completeMetricEvidence } from '../helpers/cloudwatch.js';

vi.mock('../../src/providers/aws/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/aws/client.js')>()),
  createEc2Client: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/cloudwatch.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/aws/resources/cloudwatch.js')>()),
  fetchCloudWatchSignals: vi.fn(),
}));

const mockedCreateEc2Client = vi.mocked(createEc2Client);
const mockedFetchCloudWatchSignals = vi.mocked(fetchCloudWatchSignals);

const createDailyPoints = (count: number, value: number) =>
  Array.from({ length: count }, (_, index) => ({
    timestamp: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    value,
  }));

const discoveredAttachment = {
  accountId: '123456789012',
  arn: 'arn:aws:ec2:us-east-1:123456789012:transit-gateway-attachment/tgw-attach-123',
  properties: [],
  region: 'us-east-1',
  resourceType: 'ec2:transit-gateway-attachment',
  service: 'ec2',
};

const availableVpcAttachment: TransitGatewayVpcAttachment = {
  CreationTime: new Date('2026-08-01T00:00:00.000Z'),
  State: 'available',
  TransitGatewayAttachmentId: 'tgw-attach-123',
  TransitGatewayId: 'tgw-123',
  VpcId: 'vpc-123',
};

const genericVpcAttachment: TransitGatewayAttachment = {
  ResourceType: 'vpc',
  TransitGatewayAttachmentId: 'tgw-attach-123',
};

const mockEc2Attachments = (
  options: { genericAttachments?: TransitGatewayAttachment[]; vpcAttachments?: TransitGatewayVpcAttachment[] } = {},
) => {
  const send = vi.fn(async (command: unknown) =>
    command instanceof DescribeTransitGatewayAttachmentsCommand
      ? { TransitGatewayAttachments: options.genericAttachments ?? [genericVpcAttachment] }
      : { TransitGatewayVpcAttachments: options.vpcAttachments ?? [availableVpcAttachment] },
  );
  mockedCreateEc2Client.mockReturnValue({ send } as never);
  return send;
};

const priceList = {
  products: {
    sku123: {
      attributes: {
        attachmentType: 'VPC',
        group: 'AWSTransitGateway',
        operation: 'TransitGatewayVPC',
        regionCode: 'us-east-1',
        usagetype: 'USE1-TransitGateway-Hours',
      },
    },
  },
  terms: {
    OnDemand: {
      sku123: {
        term123: {
          priceDimensions: {
            dimension123: {
              pricePerUnit: { USD: '0.0500000000' },
              unit: 'Hrs',
            },
          },
        },
      },
    },
  },
};

describe('hydrateAwsEc2TransitGatewayVpcAttachmentActivity', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T15:00:00.000Z'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(priceList), { status: 200 })));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reuses public attachment prices across accounts independently of activity collection', async () => {
    mockEc2Attachments();
    mockedFetchCloudWatchSignals.mockResolvedValue(new Map());
    const fetchPrice = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ...priceList, version: '20260901000000', publicationDate: '2026-09-01T00:00:00Z' }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchPrice);
    const identity = vi.spyOn(STSClient.prototype, 'send').mockResolvedValue({
      Account: '123456789012',
      Arn: 'arn:aws:iam::123456789012:user/test',
      UserId: 'first',
    } as never);
    const cache = { store: createMemoryEvidenceCacheStore(), authorizationContext: 'test-policy-v1' };
    const scan = () =>
      withAwsClientCredentials({ accessKeyId: 'SYNTHETIC', secretAccessKey: 'SYNTHETIC' }, () =>
        withAwsDiscoveryExecution({}, () =>
          withAwsEvidenceCache({ cache, target: { mode: 'region', region: 'us-east-1' } }, () =>
            hydrateAwsEc2TransitGatewayVpcAttachmentActivity([discoveredAttachment]),
          ),
        ),
      );
    const first = await scan();
    identity.mockResolvedValue({
      Account: '999999999999',
      Arn: 'arn:aws:iam::999999999999:user/test',
      UserId: 'second',
    } as never);
    expect(await scan()).toEqual(first);
    expect(first[0]?.hourlyAttachmentCostUsd).toBe(0.05);
    expect(fetchPrice).toHaveBeenCalledOnce();
    expect(mockedFetchCloudWatchSignals).toHaveBeenCalledTimes(2);
  });

  it('hydrates available VPC attachments with 30-day traffic totals and the public attachment price', async () => {
    const send = mockEc2Attachments({
      vpcAttachments: [
        availableVpcAttachment,
        {
          State: 'deleted',
          TransitGatewayAttachmentId: 'tgw-attach-deleted',
          TransitGatewayId: 'tgw-123',
          VpcId: 'vpc-deleted',
        },
      ],
    });
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        ['tgwIn0', completeMetricEvidence(createDailyPoints(30, 0))],
        ['tgwOut0', completeMetricEvidence(createDailyPoints(30, 0))],
      ]),
    );

    await expect(hydrateAwsEc2TransitGatewayVpcAttachmentActivity([discoveredAttachment])).resolves.toEqual([
      {
        accountId: '123456789012',
        bytesInLast30Days: 0,
        bytesOutLast30Days: 0,
        estimatedMonthlyAttachmentCostUsd: 36.5,
        hourlyAttachmentCostUsd: 0.05,
        lookbackDays: 30,
        region: 'us-east-1',
        state: 'available',
        transitGatewayAttachmentId: 'tgw-attach-123',
        transitGatewayId: 'tgw-123',
        vpcId: 'vpc-123',
      },
    ]);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          TransitGatewayAttachmentIds: ['tgw-attach-123'],
        },
      }),
    );
    expect(mockedFetchCloudWatchSignals).toHaveBeenCalledWith(
      expect.objectContaining({
        queries: [
          expect.objectContaining({
            dimensions: [
              { Name: 'TransitGateway', Value: 'tgw-123' },
              { Name: 'TransitGatewayAttachment', Value: 'tgw-attach-123' },
            ],
            id: 'tgwIn0',
            metricName: 'BytesIn',
            namespace: 'AWS/TransitGateway',
            period: 86_400,
            stat: 'Sum',
          }),
          expect.objectContaining({
            dimensions: [
              { Name: 'TransitGateway', Value: 'tgw-123' },
              { Name: 'TransitGatewayAttachment', Value: 'tgw-attach-123' },
            ],
            id: 'tgwOut0',
            metricName: 'BytesOut',
            namespace: 'AWS/TransitGateway',
            period: 86_400,
            stat: 'Sum',
          }),
        ],
        endTime: new Date('2026-09-04T00:00:00.000Z'),
        region: 'us-east-1',
        startTime: new Date('2026-08-05T00:00:00.000Z'),
      }),
    );
  });

  it('preserves unknown totals when either CloudWatch metric has incomplete coverage', async () => {
    mockEc2Attachments();
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        ['tgwIn0', completeMetricEvidence(createDailyPoints(29, 0))],
        ['tgwOut0', completeMetricEvidence(createDailyPoints(30, 0))],
      ]),
    );

    await expect(hydrateAwsEc2TransitGatewayVpcAttachmentActivity([discoveredAttachment])).resolves.toEqual([
      expect.objectContaining({
        bytesInLast30Days: null,
        bytesOutLast30Days: 0,
      }),
    ]);
  });

  it('filters non-VPC attachments before the VPC-specific lookup', async () => {
    const nonVpcAttachment = {
      ...discoveredAttachment,
      arn: 'arn:aws:ec2:us-east-1:123456789012:transit-gateway-attachment/tgw-attach-vpn',
    };
    const send = mockEc2Attachments();
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        ['tgwIn0', completeMetricEvidence(createDailyPoints(30, 0))],
        ['tgwOut0', completeMetricEvidence(createDailyPoints(30, 0))],
      ]),
    );

    await expect(
      hydrateAwsEc2TransitGatewayVpcAttachmentActivity([discoveredAttachment, nonVpcAttachment]),
    ).resolves.toHaveLength(1);

    expect(send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        input: {
          Filters: [{ Name: 'resource-type', Values: ['vpc'] }],
          TransitGatewayAttachmentIds: ['tgw-attach-123', 'tgw-attach-vpn'],
        },
      }),
    );
    expect(send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: {
          TransitGatewayAttachmentIds: ['tgw-attach-123'],
        },
      }),
    );
  });

  it('preserves unknown totals for attachments younger than the complete lookback window', async () => {
    mockEc2Attachments({
      vpcAttachments: [
        {
          ...availableVpcAttachment,
          CreationTime: new Date('2026-08-05T12:00:00.000Z'),
        },
      ],
    });
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        ['tgwIn0', completeMetricEvidence(createDailyPoints(30, 0))],
        ['tgwOut0', completeMetricEvidence(createDailyPoints(30, 0))],
      ]),
    );

    await expect(hydrateAwsEc2TransitGatewayVpcAttachmentActivity([discoveredAttachment])).resolves.toEqual([
      expect.objectContaining({
        bytesInLast30Days: null,
        bytesOutLast30Days: null,
      }),
    ]);
  });

  it('keeps the activity evidence when public pricing is unavailable', async () => {
    mockEc2Attachments();
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        ['tgwIn0', completeMetricEvidence(createDailyPoints(30, 0))],
        ['tgwOut0', completeMetricEvidence(createDailyPoints(30, 0))],
      ]),
    );
    vi.mocked(fetch).mockRejectedValue(new Error('Pricing endpoint unavailable'));

    await expect(hydrateAwsEc2TransitGatewayVpcAttachmentActivity([discoveredAttachment])).resolves.toEqual([
      expect.objectContaining({
        estimatedMonthlyAttachmentCostUsd: null,
        hourlyAttachmentCostUsd: null,
      }),
    ]);
  });

  it('preserves EC2 access-denied identity for discovery diagnostics', async () => {
    const accessDenied = Object.assign(new Error('Access denied by SCP.'), {
      name: 'AccessDeniedException',
      $metadata: { httpStatusCode: 403, requestId: 'req-tgw' },
    });
    mockedCreateEc2Client.mockReturnValue({
      send: vi
        .fn()
        .mockResolvedValueOnce({
          TransitGatewayAttachments: [
            {
              ResourceType: 'vpc',
              TransitGatewayAttachmentId: 'tgw-attach-123',
            },
          ],
        })
        .mockRejectedValueOnce(accessDenied),
    } as never);

    await expect(hydrateAwsEc2TransitGatewayVpcAttachmentActivity([discoveredAttachment])).rejects.toMatchObject({
      cause: accessDenied,
      message:
        'Amazon EC2 DescribeTransitGatewayVpcAttachments failed in us-east-1 with AccessDeniedException: Access denied by SCP. Request ID: req-tgw.',
    });
  });

  it('preserves CloudWatch access-denied identity for discovery diagnostics', async () => {
    mockEc2Attachments();
    const accessDenied = Object.assign(new Error('Access denied by SCP.'), {
      name: 'AccessDeniedException',
      $metadata: { httpStatusCode: 403, requestId: 'req-cloudwatch' },
    });
    mockedFetchCloudWatchSignals.mockRejectedValue(
      new Error(
        'Amazon CloudWatch GetMetricData failed in us-east-1 with AccessDeniedException: Access denied by SCP. Request ID: req-cloudwatch.',
        { cause: accessDenied },
      ),
    );

    await expect(hydrateAwsEc2TransitGatewayVpcAttachmentActivity([discoveredAttachment])).rejects.toMatchObject({
      cause: accessDenied,
      message:
        'Amazon CloudWatch GetMetricData failed in us-east-1 with AccessDeniedException: Access denied by SCP. Request ID: req-cloudwatch.',
    });
  });
});
