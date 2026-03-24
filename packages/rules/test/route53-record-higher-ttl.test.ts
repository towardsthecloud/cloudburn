import { describe, expect, it } from 'vitest';
import { route53RecordHigherTtlRule } from '../src/aws/route53/record-higher-ttl.js';
import type { AwsRoute53Record, AwsRoute53Zone } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createZone = (overrides: Partial<AwsRoute53Zone> = {}): AwsRoute53Zone => ({
  accountId: '123456789012',
  hostedZoneArn: 'arn:aws:route53:::hostedzone/Z1234567890ABC',
  hostedZoneId: 'Z1234567890ABC',
  region: 'global',
  zoneName: 'example.com.',
  ...overrides,
});

const createRecord = (overrides: Partial<AwsRoute53Record> = {}): AwsRoute53Record => ({
  accountId: '123456789012',
  healthCheckId: undefined,
  hostedZoneId: 'Z1234567890ABC',
  isAlias: false,
  recordId: 'arn:aws:route53:::hostedzone/Z1234567890ABC/recordset/api.example.com./A',
  recordName: 'api.example.com.',
  recordType: 'A',
  region: 'global',
  ttl: 300,
  ...overrides,
});

describe('route53RecordHigherTtlRule', () => {
  it('flags non-alias records with a TTL below 3600 seconds', () => {
    const finding = route53RecordHigherTtlRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-route53-records': [createRecord()],
        'aws-route53-zones': [createZone()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        resourceId: 'arn:aws:route53:::hostedzone/Z1234567890ABC/recordset/api.example.com./A',
      },
    ]);
  });

  it('skips alias records and records whose TTL is already at or above 3600 seconds', () => {
    const finding = route53RecordHigherTtlRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-route53-records': [createRecord({ isAlias: true, ttl: undefined }), createRecord({ ttl: 3600 })],
        'aws-route53-zones': [createZone()],
      }),
    });

    expect(finding).toBeNull();
  });
});
