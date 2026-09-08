import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EC2Client } from '@aws-sdk/client-ec2';
import type { HttpRequest } from '@aws-sdk/types';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CloudBurnClient } from '../src/index.js';
import { getAwsDiscoveryDatasetDefinition } from '../src/providers/aws/discovery-registry.js';

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
let metricScenario: 'sagemaker' | 'lambda';
let metricWindows: Array<{ start: string; end: string }>;
let lambdaInventoryCalls: number;
const functionArn = 'arn:aws:lambda:eu-west-1:111111111111:function:orders';

beforeEach(() => {
  endpointNames = ['orders'];
  unexpected = [];
  metricScenario = 'sagemaker';
  metricWindows = [];
  lambdaInventoryCalls = 0;
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
        if (metricScenario === 'lambda') {
          return jsonResponse({
            Resources: [
              {
                Arn: functionArn,
                OwningAccountId: '111111111111',
                Region: 'eu-west-1',
                ResourceType: 'lambda:function',
                Service: 'lambda',
              },
            ],
          });
        }
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
    if (
      metricScenario === 'lambda' &&
      request.hostname === 'lambda.eu-west-1.amazonaws.com' &&
      request.method === 'GET' &&
      request.path.startsWith('/2015-03-31/functions')
    ) {
      lambdaInventoryCalls += 1;
      return jsonResponse({
        Functions: [
          { FunctionArn: functionArn, FunctionName: 'orders', Architectures: ['arm64'], Timeout: 60, MemorySize: 128 },
        ],
      });
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
        StartTime: number;
        EndTime: number;
        MetricDataQueries: Array<{
          Id: string;
          MetricStat: { Metric: { Dimensions: Array<{ Name: string; Value: string }> } };
        }>;
      };
      if (metricScenario === 'lambda') {
        metricWindows.push({
          start: new Date(input.StartTime * 1000).toISOString(),
          end: new Date(input.EndTime * 1000).toISOString(),
        });
        return jsonResponse({
          MetricDataResults: input.MetricDataQueries.map((query) => ({
            Id: query.Id,
            StatusCode: 'Complete',
            Timestamps: [input.EndTime - 3600],
            Values: [query.Id.startsWith('errors') ? 0 : query.Id.startsWith('durationSum') ? 100 : 10],
          })),
        });
      }
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

const discoverCachedLambda = () =>
  new CloudBurnClient().discover({
    target: { mode: 'regions', regions: ['eu-west-1'] },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-LAMBDA-2'] } },
    aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
    cache: { directory: join(admissionDirectory, 'evidence'), authorizationContext: 'lambda-window-policy' },
    includeEvaluationResources: true,
  });

it('reuses a rolling observation window across minutes and refreshes at its freshness boundary', {
  timeout: 20_000,
}, async () => {
  metricScenario = 'lambda';
  vi.setSystemTime(new Date('2026-09-07T12:01:30.000Z'));
  const first = await discoverCachedLambda();
  // Reuse fixes the actual AWS query end at the start of the five-minute
  // freshness interval, so provenance must disclose 12:00 rather than 12:01:30.
  const firstWindow = { start: '2026-08-31T12:00:00.000Z', end: '2026-09-07T12:00:00.000Z' };
  expect(metricWindows).toEqual([firstWindow]);
  expect(first.evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        datasetKey: 'aws-lambda-function-metrics',
        source: 'live',
        complete: true,
        observedAt: firstWindow.end,
        observationWindow: firstWindow,
      }),
    ]),
  );

  vi.setSystemTime(new Date('2026-09-07T12:02:30.000Z'));
  const second = await discoverCachedLambda();
  expect(metricWindows).toEqual([firstWindow]);
  expect(second.evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        datasetKey: 'aws-lambda-function-metrics',
        source: 'cache',
        complete: true,
        observedAt: firstWindow.end,
        observationWindow: firstWindow,
      }),
    ]),
  );

  vi.setSystemTime(new Date('2026-09-07T12:05:30.000Z'));
  const third = await discoverCachedLambda();
  const nextWindow = { start: '2026-08-31T12:05:00.000Z', end: '2026-09-07T12:05:00.000Z' };
  expect(metricWindows).toEqual([firstWindow, nextWindow]);
  expect(lambdaInventoryCalls).toBe(1);
  expect(third.evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        datasetKey: 'aws-lambda-function-metrics',
        source: 'live',
        complete: true,
        observedAt: nextWindow.end,
        observationWindow: nextWindow,
      }),
    ]),
  );
});

it('recollects derived metrics when the inventory loader version changes with identical normalized inventory', {
  timeout: 20_000,
}, async () => {
  metricScenario = 'lambda';
  vi.setSystemTime(new Date('2026-09-07T12:01:30.000Z'));
  const definition = getAwsDiscoveryDatasetDefinition('aws-lambda-functions');
  if (!definition) throw new Error('Missing Lambda inventory definition');
  const originalVersion = definition.loaderVersion;
  await discoverCachedLambda();
  try {
    definition.loaderVersion = `${originalVersion}-test-revision`;
    const second = await discoverCachedLambda();
    expect(lambdaInventoryCalls).toBe(2);
    expect(metricWindows).toEqual([
      { start: '2026-08-31T12:00:00.000Z', end: '2026-09-07T12:00:00.000Z' },
      { start: '2026-08-31T12:00:00.000Z', end: '2026-09-07T12:00:00.000Z' },
    ]);
    expect(second.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          datasetKey: 'aws-lambda-function-metrics',
          source: 'live',
          complete: true,
        }),
      ]),
    );
  } finally {
    definition.loaderVersion = originalVersion;
  }
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
