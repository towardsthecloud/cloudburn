import { describe, expect, it } from 'vitest';
import { route53HealthCheckUnusedRule } from '../src/aws/route53/health-check-unused.js';
import type {
  AwsRoute53HealthCheck,
  AwsRoute53Record,
  AwsStaticRoute53HealthCheck,
  AwsStaticRoute53Record,
} from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const createHealthCheck = (overrides: Partial<AwsRoute53HealthCheck> = {}): AwsRoute53HealthCheck => ({
  accountId: '123456789012',
  healthCheckArn: 'arn:aws:route53:::healthcheck/abcdef12-3456-7890-abcd-ef1234567890',
  healthCheckId: 'abcdef12-3456-7890-abcd-ef1234567890',
  region: 'global',
  ...overrides,
});

const createRecord = (overrides: Partial<AwsRoute53Record> = {}): AwsRoute53Record => ({
  accountId: '123456789012',
  healthCheckId: 'abcdef12-3456-7890-abcd-ef1234567890',
  hostedZoneId: 'Z1234567890ABC',
  isAlias: false,
  recordId: 'arn:aws:route53:::hostedzone/Z1234567890ABC/recordset/api.example.com./A',
  recordName: 'api.example.com.',
  recordType: 'A',
  region: 'global',
  ttl: 300,
  ...overrides,
});

const createStaticHealthCheck = (
  overrides: Partial<AwsStaticRoute53HealthCheck> = {},
): AwsStaticRoute53HealthCheck => ({
  resourceId: 'aws_route53_health_check.api',
  ...overrides,
});

const createStaticRecord = (overrides: Partial<AwsStaticRoute53Record> = {}): AwsStaticRoute53Record => ({
  isAlias: false,
  referencedHealthCheckResourceId: 'aws_route53_health_check.api',
  resourceId: 'aws_route53_record.api',
  ttl: 300,
  ...overrides,
});

describe('route53HealthCheckUnusedRule', () => {
  it('flags health checks that are not associated with any record set', () => {
    const finding = route53HealthCheckUnusedRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-route53-health-checks': [createHealthCheck()],
        'aws-route53-records': [],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        resourceId: 'arn:aws:route53:::healthcheck/abcdef12-3456-7890-abcd-ef1234567890',
      },
    ]);
  });

  it('skips health checks already referenced by a record set', () => {
    const finding = route53HealthCheckUnusedRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-route53-health-checks': [createHealthCheck()],
        'aws-route53-records': [createRecord()],
      }),
    });

    expect(finding).toBeNull();
  });

  it('flags static health checks that are not associated with any record set', () => {
    const finding = route53HealthCheckUnusedRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-route53-health-checks': [createStaticHealthCheck()],
        'aws-route53-records': [],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        resourceId: 'aws_route53_health_check.api',
      },
    ]);
  });

  it('skips static health checks already referenced by a local record set', () => {
    const finding = route53HealthCheckUnusedRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-route53-health-checks': [createStaticHealthCheck()],
        'aws-route53-records': [createStaticRecord()],
      }),
    });

    expect(finding).toBeNull();
  });
});
