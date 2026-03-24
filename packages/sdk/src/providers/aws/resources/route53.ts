import {
  ListHealthChecksCommand,
  ListHostedZonesCommand,
  ListResourceRecordSetsCommand,
  type RRType,
} from '@aws-sdk/client-route-53';
import type { AwsDiscoveredResource, AwsRoute53HealthCheck, AwsRoute53Record, AwsRoute53Zone } from '@cloudburn/rules';
import { createRoute53Client, resolveAwsAccountId } from '../client.js';
import { withAwsServiceErrorContext } from './utils.js';

const ROUTE53_CONTROL_REGION = 'us-east-1';

const extractArnPartition = (arn: string): string => arn.split(':')[1] ?? 'aws';

const parseHostedZoneArn = (arn: string): { hostedZoneArn: string; hostedZoneId: string; partition: string } | null => {
  const match = /^arn:([^:]+):route53:::hostedzone\/([^/]+)$/u.exec(arn);

  if (!match) {
    return null;
  }

  const partition = match[1];
  const hostedZoneId = match[2];

  if (!partition || !hostedZoneId) {
    return null;
  }

  return {
    hostedZoneArn: arn,
    hostedZoneId,
    partition,
  };
};

const parseHealthCheckArn = (arn: string): { healthCheckArn: string; healthCheckId: string } | null => {
  const match = /^arn:[^:]+:route53:::healthcheck\/([^/]+)$/u.exec(arn);

  if (!match) {
    return null;
  }

  const healthCheckId = match[1];

  if (!healthCheckId) {
    return null;
  }

  return {
    healthCheckArn: arn,
    healthCheckId,
  };
};

const buildRoute53RecordId = (
  zone: {
    hostedZoneId: string;
    partition: string;
  },
  record: {
    Name?: string;
    SetIdentifier?: string;
    Type?: string;
  },
): string => {
  const suffix = record.SetIdentifier ? `/${record.SetIdentifier}` : '';

  return `arn:${zone.partition}:route53:::hostedzone/${zone.hostedZoneId}/recordset/${record.Name ?? 'unknown'}/${record.Type ?? 'unknown'}${suffix}`;
};

const listHostedZoneResources = async (): Promise<AwsDiscoveredResource[]> => {
  const client = createRoute53Client();
  const accountId = await resolveAwsAccountId();
  const resources: AwsDiscoveredResource[] = [];
  let marker: string | undefined;

  do {
    const response = await withAwsServiceErrorContext(
      'Amazon Route 53',
      'ListHostedZones',
      ROUTE53_CONTROL_REGION,
      () =>
        client.send(
          new ListHostedZonesCommand({
            Marker: marker,
          }),
        ),
    );

    for (const zone of response.HostedZones ?? []) {
      if (!zone.Id) {
        continue;
      }

      const hostedZoneId = zone.Id.replace(/^\/hostedzone\//u, '');
      resources.push({
        accountId,
        arn: `arn:aws:route53:::hostedzone/${hostedZoneId}`,
        name: zone.Name,
        properties: [],
        region: 'global',
        resourceType: 'route53:hostedzone',
        service: 'route53',
      });
    }

    marker = response.NextMarker;
  } while (marker);

  return resources;
};

/**
 * Hydrates Route 53 hosted zones for rule evaluation.
 *
 * @param resources - Optional catalog resources filtered to Route 53 hosted zones.
 * @returns Normalized hosted zones for downstream rule evaluation.
 */
export const hydrateAwsRoute53Zones = async (resources: AwsDiscoveredResource[]): Promise<AwsRoute53Zone[]> =>
  (resources.length > 0 ? resources : await listHostedZoneResources())
    .flatMap((resource) => {
      const parsed = parseHostedZoneArn(resource.arn);

      return parsed
        ? [
            {
              accountId: resource.accountId,
              hostedZoneArn: parsed.hostedZoneArn,
              hostedZoneId: parsed.hostedZoneId,
              region: resource.region,
              zoneName: resource.name ?? parsed.hostedZoneId,
            } satisfies AwsRoute53Zone,
          ]
        : [];
    })
    .sort((left, right) => left.hostedZoneArn.localeCompare(right.hostedZoneArn));

/**
 * Hydrates Route 53 hosted zones with their record sets.
 *
 * @param resources - Optional catalog resources filtered to Route 53 hosted zones.
 * @returns Normalized Route 53 record sets for TTL and health-check rules.
 */
export const hydrateAwsRoute53Records = async (resources: AwsDiscoveredResource[]): Promise<AwsRoute53Record[]> => {
  const zoneResources = resources.length > 0 ? resources : await listHostedZoneResources();
  const client = createRoute53Client();
  const records: AwsRoute53Record[] = [];

  for (const resource of zoneResources) {
    const parsedZone = parseHostedZoneArn(resource.arn);

    if (!parsedZone) {
      continue;
    }

    let nextRecordIdentifier: string | undefined;
    let nextRecordName: string | undefined;
    let nextRecordType: RRType | undefined;

    do {
      const response = await withAwsServiceErrorContext(
        'Amazon Route 53',
        'ListResourceRecordSets',
        ROUTE53_CONTROL_REGION,
        () =>
          client.send(
            new ListResourceRecordSetsCommand({
              HostedZoneId: parsedZone.hostedZoneId,
              StartRecordIdentifier: nextRecordIdentifier,
              StartRecordName: nextRecordName,
              StartRecordType: nextRecordType as never,
            }),
          ),
      );

      for (const recordSet of response.ResourceRecordSets ?? []) {
        if (!recordSet.Name || !recordSet.Type) {
          continue;
        }

        records.push({
          accountId: resource.accountId,
          healthCheckId: recordSet.HealthCheckId,
          hostedZoneId: parsedZone.hostedZoneId,
          isAlias: recordSet.AliasTarget !== undefined,
          recordId: buildRoute53RecordId(parsedZone, recordSet),
          recordName: recordSet.Name,
          recordSetIdentifier: recordSet.SetIdentifier,
          recordType: recordSet.Type,
          region: resource.region,
          ttl: recordSet.TTL,
        });
      }

      nextRecordIdentifier = response.IsTruncated ? response.NextRecordIdentifier : undefined;
      nextRecordName = response.IsTruncated ? response.NextRecordName : undefined;
      nextRecordType = response.IsTruncated ? response.NextRecordType : undefined;
    } while (nextRecordName && nextRecordType);
  }

  return records.sort((left, right) => left.recordId.localeCompare(right.recordId));
};

/**
 * Hydrates Route 53 health checks for rule evaluation.
 *
 * @param resources - Optional catalog resources filtered to Route 53 health checks.
 * @returns Normalized Route 53 health checks for rule evaluation.
 */
export const hydrateAwsRoute53HealthChecks = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsRoute53HealthCheck[]> => {
  const desiredHealthChecks = new Map(
    resources.flatMap((resource) => {
      const parsed = parseHealthCheckArn(resource.arn);

      return parsed ? [[parsed.healthCheckId, resource] as const] : [];
    }),
  );
  const client = createRoute53Client();
  const accountId = desiredHealthChecks.size > 0 ? undefined : await resolveAwsAccountId();
  const healthChecks: AwsRoute53HealthCheck[] = [];
  let marker: string | undefined;

  do {
    const response = await withAwsServiceErrorContext(
      'Amazon Route 53',
      'ListHealthChecks',
      ROUTE53_CONTROL_REGION,
      () =>
        client.send(
          new ListHealthChecksCommand({
            Marker: marker,
          }),
        ),
    );

    for (const healthCheck of response.HealthChecks ?? []) {
      if (!healthCheck.Id) {
        continue;
      }

      if (desiredHealthChecks.size > 0 && !desiredHealthChecks.has(healthCheck.Id)) {
        continue;
      }

      const resource = desiredHealthChecks.get(healthCheck.Id);
      healthChecks.push({
        accountId: resource?.accountId ?? accountId ?? 'unknown',
        healthCheckArn:
          resource?.arn ??
          `arn:${extractArnPartition(resource?.arn ?? 'arn:aws:route53')}:route53:::healthcheck/${healthCheck.Id}`,
        healthCheckId: healthCheck.Id,
        region: resource?.region ?? 'global',
      });
    }

    marker = response.NextMarker;
  } while (marker);

  return healthChecks.sort((left, right) => left.healthCheckArn.localeCompare(right.healthCheckArn));
};
