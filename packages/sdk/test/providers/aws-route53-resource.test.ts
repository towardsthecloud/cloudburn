import type {
  ListHealthChecksCommand,
  ListHostedZonesCommand,
  ListResourceRecordSetsCommand,
} from '@aws-sdk/client-route-53';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoute53Client, resolveAwsAccountId } from '../../src/providers/aws/client.js';
import {
  hydrateAwsRoute53HealthChecks,
  hydrateAwsRoute53Records,
  hydrateAwsRoute53Zones,
} from '../../src/providers/aws/resources/route53.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createRoute53Client: vi.fn(),
  resolveAwsAccountId: vi.fn(),
}));

const mockedCreateRoute53Client = vi.mocked(createRoute53Client);
const mockedResolveAwsAccountId = vi.mocked(resolveAwsAccountId);

describe('Route 53 discovery resources', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('falls back to listing hosted zones and record sets when catalog resources are unavailable', async () => {
    const resolveAccountId = vi.fn().mockResolvedValue('123456789012');
    const context = {
      resolveAccountId,
    };
    mockedCreateRoute53Client.mockReturnValue({
      send: vi.fn(async (command: ListHostedZonesCommand | ListResourceRecordSetsCommand) => {
        if (command.constructor.name === 'ListHostedZonesCommand') {
          return {
            HostedZones: [
              {
                Id: '/hostedzone/Z1234567890',
                Name: 'example.com.',
              },
            ],
          };
        }

        return {
          IsTruncated: false,
          ResourceRecordSets: [
            {
              Name: 'www.example.com.',
              TTL: 300,
              Type: 'A',
            },
          ],
        };
      }),
    } as never);

    await expect(hydrateAwsRoute53Zones([], context)).resolves.toEqual([
      {
        accountId: '123456789012',
        hostedZoneArn: 'arn:aws:route53:::hostedzone/Z1234567890',
        hostedZoneId: 'Z1234567890',
        region: 'global',
        zoneName: 'example.com.',
      },
    ]);
    await expect(hydrateAwsRoute53Records([], context)).resolves.toEqual([
      {
        accountId: '123456789012',
        hostedZoneId: 'Z1234567890',
        isAlias: false,
        recordId: 'arn:aws:route53:::hostedzone/Z1234567890/recordset/www.example.com./A',
        recordName: 'www.example.com.',
        recordType: 'A',
        region: 'global',
        ttl: 300,
      },
    ]);
    expect(resolveAccountId).toHaveBeenCalledTimes(2);
    expect(mockedResolveAwsAccountId).not.toHaveBeenCalled();
  });

  it('lists record sets for multiple zones concurrently within a bounded batch', async () => {
    let currentInFlight = 0;
    let maxInFlight = 0;
    const send = vi.fn(
      async (command: ListResourceRecordSetsCommand) =>
        new Promise((resolve) => {
          currentInFlight += 1;
          maxInFlight = Math.max(maxInFlight, currentInFlight);

          const input = command.input as { HostedZoneId?: string };

          setTimeout(() => {
            currentInFlight -= 1;
            resolve({
              IsTruncated: false,
              ResourceRecordSets: [
                {
                  Name: `${input.HostedZoneId}.example.com.`,
                  TTL: 300,
                  Type: 'A',
                },
              ],
            });
          }, 1);
        }),
    );

    mockedCreateRoute53Client.mockReturnValue({ send } as never);

    const zoneResources = Array.from({ length: 12 }, (_, index) => ({
      accountId: '123456789012',
      arn: `arn:aws:route53:::hostedzone/Z${index}ZONE`,
      properties: [],
      region: 'global',
      resourceType: 'route53:hostedzone',
      service: 'route53',
    }));

    const records = await hydrateAwsRoute53Records(zoneResources);

    expect(records).toHaveLength(12);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(5);
  });

  it('falls back to listing health checks when catalog resources are unavailable', async () => {
    mockedResolveAwsAccountId.mockResolvedValue('123456789012');
    mockedCreateRoute53Client.mockReturnValue({
      send: vi.fn(async (_command: ListHealthChecksCommand) => ({
        HealthChecks: [
          {
            Id: 'abcd1234',
          },
        ],
      })),
    } as never);

    await expect(hydrateAwsRoute53HealthChecks([])).resolves.toEqual([
      {
        accountId: '123456789012',
        healthCheckArn: 'arn:aws:route53:::healthcheck/abcd1234',
        healthCheckId: 'abcd1234',
        region: 'global',
      },
    ]);
  });
});
