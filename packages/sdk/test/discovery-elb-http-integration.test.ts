import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EC2Client } from '@aws-sdk/client-ec2';
import type { HttpRequest } from '@aws-sdk/types';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CloudBurnClient } from '../src/index.js';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/aws-discovery/${name}`, import.meta.url), 'utf8');
const jsonResponse = (body: unknown) => ({
  response: {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify(body)),
  },
});
const accountId = '111111111111';
const region = 'eu-west-1';
const prefix = (name: string) => (name.startsWith('net') ? 'net' : name.startsWith('gwy') ? 'gwy' : 'app');
const loadBalancerArn = (name: string, type = prefix(name)) =>
  `arn:aws:elasticloadbalancing:${region}:${accountId}:loadbalancer/${type}/${name}/123`;
const targetGroupArn = (name: string) => `arn:aws:elasticloadbalancing:${region}:${accountId}:targetgroup/${name}/123`;
const identity = (name: string, type = prefix(name)) => ({
  accountId,
  region,
  resourceId: loadBalancerArn(name, type),
});
const xmlResponse = (operation: string, content: string) => ({
  response: {
    statusCode: 200,
    headers: { 'content-type': 'text/xml' },
    body: Buffer.from(
      `<${operation}Response xmlns="http://elasticloadbalancing.amazonaws.com/doc/2015-12-01/"><${operation}Result>${content}</${operation}Result><ResponseMetadata><RequestId>synthetic</RequestId></ResponseMetadata></${operation}Response>`,
    ),
  },
});
let names: string[];
let includeTargets: boolean;
let metricCases: Record<string, string>;
let unexpected: string[];
let requests: Array<{ operation: string; input: URLSearchParams }>;
let admissionDirectory: string;

beforeEach(() => {
  names = Array.from({ length: 10 }, (_, index) => `alb-${index}`);
  requests = [];
  includeTargets = false;
  metricCases = {};
  unexpected = [];
  admissionDirectory = mkdtempSync(join(tmpdir(), 'cloudburn-elb-http-'));
  vi.stubEnv('CLOUDBURN_AWS_ADMISSION_DIR', admissionDirectory);
  // Keep the observation date stable while allowing real admission waits to refill quota tokens.
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-09-07T12:00:00.000Z'));
  vi.stubEnv('CI', 'true');
  vi.stubEnv('AWS_REGION', '');
  vi.stubEnv('AWS_DEFAULT_REGION', '');
  vi.stubEnv('aws_region', '');
  vi.stubEnv('AWS_CONFIG_FILE', '/dev/null');
  vi.stubEnv('AWS_SHARED_CREDENTIALS_FILE', '/dev/null');
  const probe = new EC2Client({ region: 'eu-west-1' });
  const transport: typeof probe.config.requestHandler = Object.getPrototypeOf(probe.config.requestHandler);
  probe.destroy();
  vi.spyOn(transport, 'handle').mockImplementation(async (request: HttpRequest) => {
    const body = request.body ? String(request.body) : '';
    const operation =
      request.headers['x-amz-target']?.split('.').at(-1) ??
      (request.path === '/' ? (new URLSearchParams(body).get('Action') ?? '') : request.path.slice(1));
    if (request.hostname === 'resource-explorer-2.eu-west-1.amazonaws.com') {
      if (operation === 'ListIndexes') return jsonResponse(JSON.parse(fixture('indexes.json')));
      if (operation === 'GetDefaultView') return jsonResponse(JSON.parse(fixture('default-view.json')));
      if (operation === 'GetView') return jsonResponse(JSON.parse(fixture('view.json')));
      if (operation === 'ListResources') {
        return jsonResponse({
          Resources: [
            ...names.map((name) => ({
              Arn: loadBalancerArn(name),
              OwningAccountId: '111111111111',
              Region: 'eu-west-1',
              ResourceType: `elasticloadbalancing:loadbalancer/${prefix(name)}`,
              Service: 'elasticloadbalancing',
            })),
            ...(includeTargets
              ? names.map((name) => ({
                  Arn: targetGroupArn(name),
                  OwningAccountId: accountId,
                  Region: region,
                  ResourceType: 'elasticloadbalancing:targetgroup',
                  Service: 'elasticloadbalancing',
                }))
              : []),
          ],
        });
      }
    }
    if (request.hostname === 'sts.eu-west-1.amazonaws.com' && operation === 'GetCallerIdentity') {
      return {
        response: {
          statusCode: 200,
          headers: { 'content-type': 'text/xml' },
          body: Buffer.from(fixture('caller-identity.xml')),
        },
      };
    }
    if (request.hostname === 'ec2.eu-west-1.amazonaws.com' && operation === 'DescribeRegions') {
      return {
        response: {
          statusCode: 200,
          headers: { 'content-type': 'text/xml' },
          body: Buffer.from(fixture('regions.xml')),
        },
      };
    }
    if (request.hostname === 'elasticloadbalancing.eu-west-1.amazonaws.com') {
      const input = new URLSearchParams(body);
      requests.push({ operation, input });
      if (operation === 'DescribeTargetGroups' && input.has('LoadBalancerArn')) {
        const name = input.get('LoadBalancerArn')?.split('/')[2] ?? '';
        return xmlResponse(
          operation,
          `<TargetGroups>${includeTargets ? `<member><TargetGroupArn>${targetGroupArn(name)}</TargetGroupArn></member>` : ''}</TargetGroups>`,
        );
      }
      if (operation === 'DescribeTargetGroups' && input.has('TargetGroupArns.member.1')) {
        const arns = [...input.entries()]
          .filter(([key]) => key.startsWith('TargetGroupArns.member.'))
          .map(([, value]) => value);
        return xmlResponse(
          operation,
          `<TargetGroups>${arns.map((arn) => `<member><TargetGroupArn>${arn}</TargetGroupArn><LoadBalancerArns><member>${loadBalancerArn(arn.split('/')[1] ?? '')}</member></LoadBalancerArns></member>`).join('')}</TargetGroups>`,
        );
      }
      if (operation === 'DescribeTargetHealth') {
        return xmlResponse(
          operation,
          '<TargetHealthDescriptions><member><Target><Id>i-example</Id></Target></member></TargetHealthDescriptions>',
        );
      }
      if (operation === 'DescribeLoadBalancers') {
        const arns = [...input.entries()]
          .filter(([key]) => key.startsWith('LoadBalancerArns.member.'))
          .map(([, value]) => value);
        return xmlResponse(
          operation,
          `<LoadBalancers>${arns.map((arn) => `<member><LoadBalancerArn>${arn}</LoadBalancerArn><LoadBalancerName>${arn.split('/')[2]}</LoadBalancerName><Type>${arn.includes('/net/') ? 'network' : arn.includes('/gwy/') ? 'gateway' : 'application'}</Type></member>`).join('')}</LoadBalancers>`,
        );
      }
    }
    if (request.hostname === 'monitoring.eu-west-1.amazonaws.com' && operation === 'GetMetricData') {
      requests.push({ operation, input: new URLSearchParams() });
      const input = JSON.parse(body) as {
        MetricDataQueries: Array<{
          Id: string;
          MetricStat: { Metric: { Dimensions: Array<{ Name: string; Value: string }> } };
        }>;
      };
      return jsonResponse({
        MetricDataResults: input.MetricDataQueries.flatMap((query) => {
          const name = query.MetricStat.Metric.Dimensions[0]?.Value.split('/')[1] ?? '';
          const status = metricCases[name] ?? 'Complete';
          if (status === 'Missing') return [];
          return {
            Id: query.Id,
            StatusCode: status === 'Empty' ? 'Complete' : status,
            Timestamps:
              status === 'Empty'
                ? []
                : Array.from({ length: 14 }, (_, index) => Date.parse('2026-08-24T00:00:00Z') / 1000 + index * 86_400),
            Values: status === 'Empty' ? [] : Array.from({ length: 14 }, () => 5),
          };
        }),
      });
    }
    const description = `${request.method} ${request.hostname}${request.path} (${operation})`;
    unexpected.push(description);
    throw new Error(`Unexpected offline AWS request: ${description}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  rmSync(admissionDirectory, { recursive: true, force: true });
  expect(unexpected).toEqual([]);
});

const discover = () =>
  new CloudBurnClient().discover({
    target: { mode: 'regions', regions: ['eu-west-1'] },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-ELB-5'] } },
    aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
    includeEvaluationResources: true,
  });

it('loads inventory plus activity for ten ALBs with eleven metadata calls, counting health and metrics separately', async () => {
  const result = await discover();

  expect(result.diagnostics ?? []).toEqual([]);
  expect(result.evaluations?.rules[0]?.coverage?.assessed).toHaveLength(10);
  expect(requests.filter(({ operation }) => operation === 'DescribeTargetGroups')).toHaveLength(10);
  expect(requests.filter(({ operation }) => operation === 'DescribeLoadBalancers')).toHaveLength(1);
  expect(requests.filter(({ operation }) => operation === 'DescribeTargetHealth')).toHaveLength(0);
  expect(requests.filter(({ operation }) => operation === 'GetMetricData')).toHaveLength(1);
});

it.each([
  'PartialData',
  'Forbidden',
  'InternalError',
  'Missing',
  'Empty',
])('retains unknown %s metric evidence beside a valid idle finding', async (status) => {
  names = ['idle', 'uncertain'];
  includeTargets = true;
  metricCases = { uncertain: status };

  const result = await discover();

  expect(result.providers[0]?.rules[0]?.findings).toEqual([identity('idle')]);
  expect(result.evaluations?.rules).toEqual([
    expect.objectContaining({
      ruleId: 'CLDBRN-AWS-ELB-5',
      status: 'triggered',
      findingCount: 1,
      coverage: { assessed: [identity('idle')], unknown: [identity('uncertain')] },
    }),
  ]);
  expect(requests.filter(({ operation }) => operation === 'DescribeTargetHealth')).toHaveLength(2);
});

it('reports NLB and Gateway activity as unknown without sending HTTP metric queries', async () => {
  names = ['net-example', 'gwy-example'];
  includeTargets = true;

  const result = await discover();

  expect(result.providers).toEqual([]);
  expect(result.evaluations?.rules).toEqual([
    expect.objectContaining({
      ruleId: 'CLDBRN-AWS-ELB-5',
      status: 'unknown',
      findingCount: 0,
      coverage: { assessed: [], unknown: [identity('gwy-example'), identity('net-example')] },
    }),
  ]);
  expect(requests.filter(({ operation }) => operation === 'GetMetricData')).toHaveLength(0);
  expect(requests.filter(({ operation }) => operation === 'DescribeTargetHealth')).toHaveLength(2);
});
