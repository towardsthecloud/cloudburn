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
const endpointArn = (name: string) => `arn:aws:sagemaker:eu-west-1:111111111111:endpoint/${name}`;
const endpointIdentity = (name: string) => ({
  accountId: '111111111111',
  region: 'eu-west-1',
  resourceId: name,
});
let endpointNames: string[];
let unexpected: string[];
let admissionDirectory: string;

beforeEach(() => {
  endpointNames = ['orders'];
  unexpected = [];
  admissionDirectory = mkdtempSync(join(tmpdir(), 'cloudburn-metric-http-'));
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
          Resources: endpointNames.map((name) => ({
            Arn: endpointArn(name),
            OwningAccountId: '111111111111',
            Region: 'eu-west-1',
            ResourceType: 'sagemaker:endpoint',
            Service: 'sagemaker',
          })),
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
    if (request.hostname === 'api.sagemaker.eu-west-1.amazonaws.com') {
      const input = JSON.parse(body);
      if (operation === 'DescribeEndpoint' && endpointNames.includes(input.EndpointName)) {
        return jsonResponse({
          EndpointArn: endpointArn(input.EndpointName),
          EndpointName: input.EndpointName,
          EndpointConfigName: 'shared-config',
          EndpointStatus: 'InService',
          CreationTime: Date.parse('2026-01-01T00:00:00Z') / 1000,
        });
      }
      if (operation === 'DescribeEndpointConfig' && input.EndpointConfigName === 'shared-config') {
        return jsonResponse({ ProductionVariants: [{ VariantName: 'AllTraffic' }] });
      }
    }
    if (request.hostname === 'monitoring.eu-west-1.amazonaws.com' && operation === 'GetMetricData') {
      const input = JSON.parse(body) as {
        MetricDataQueries: Array<{
          Id: string;
          MetricStat: { Metric: { Dimensions: Array<{ Name: string; Value: string }> } };
        }>;
      };
      return jsonResponse({
        MetricDataResults: input.MetricDataQueries.map((query) => {
          const name = query.MetricStat.Metric.Dimensions.find((dimension) => dimension.Name === 'EndpointName')?.Value;
          const partial = name === 'orders';
          return {
            Id: query.Id,
            StatusCode: partial ? 'PartialData' : 'Complete',
            Timestamps: partial
              ? [Date.parse('2026-09-06T00:00:00Z') / 1000]
              : Array.from({ length: 14 }, (_, index) => Date.parse('2026-08-24T00:00:00Z') / 1000 + index * 86_400),
            Values: partial ? [500] : Array.from({ length: 14 }, () => 0),
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
    config: { discovery: { enabledRules: ['CLDBRN-AWS-SAGEMAKER-2'] } },
    aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
    includeEvaluationResources: true,
  });

it('reports partial SageMaker invocation evidence as unknown without an idle finding', async () => {
  const result = await discover();

  expect(result.providers).toEqual([]);
  expect(result.evaluations?.rules).toEqual([
    expect.objectContaining({
      ruleId: 'CLDBRN-AWS-SAGEMAKER-2',
      status: 'unknown',
      findingCount: 0,
      coverage: { assessed: [], unknown: [endpointIdentity('orders')] },
    }),
  ]);
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([expect.objectContaining({ ruleId: 'CLDBRN-AWS-SAGEMAKER-2', status: 'skipped' })]),
  );
});

it('retains an idle SageMaker finding while exposing another endpoint with unknown evidence', async () => {
  endpointNames = ['orders', 'idle'];

  const result = await discover();

  expect(result.providers[0]?.rules[0]?.findings).toEqual([endpointIdentity('idle')]);
  expect(result.evaluations?.rules).toEqual([
    expect.objectContaining({
      ruleId: 'CLDBRN-AWS-SAGEMAKER-2',
      status: 'triggered',
      findingCount: 1,
      coverage: { assessed: [endpointIdentity('idle')], unknown: [endpointIdentity('orders')] },
    }),
  ]);
});
