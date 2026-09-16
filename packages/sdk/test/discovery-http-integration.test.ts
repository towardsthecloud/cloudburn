import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EC2Client } from '@aws-sdk/client-ec2';
import { ResourceExplorer2Client } from '@aws-sdk/client-resource-explorer-2';
import { STSClient } from '@aws-sdk/client-sts';
import type { HttpHandlerOptions, HttpRequest } from '@aws-sdk/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AwsCapabilityReason,
  type AwsCapabilityScope,
  type AwsCapabilityStatus,
  type AwsDiscoveryProgressEvent,
  type AwsDiscoveryTarget,
  CloudBurnClient,
  withAwsClientCredentials,
} from '../src/index.js';
import { decodeRequestBody } from './helpers/http.js';

/** Options accepted by {@link CloudBurnClient.discover}, reused so test fixtures stay in sync with the public contract. */
type DiscoverOptions = NonNullable<Parameters<CloudBurnClient['discover']>[0]>;
/** Reusable-evidence fixtures always set a regional target and a directory-backed cache. */
type RegionsCacheDiscoverOptions = DiscoverOptions & {
  target: Extract<NonNullable<DiscoverOptions['target']>, { mode: 'regions' }>;
  cache: NonNullable<DiscoverOptions['cache']> & { directory: string };
};

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/aws-discovery/${name}`, import.meta.url), 'utf8');
const jsonResponse = (body: unknown) => ({
  response: {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify(body)),
  },
});
const jsonFixture = (name: string) => jsonResponse(JSON.parse(fixture(name)));
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
type ElbScenario = {
  names: string[];
  includeTargets: boolean;
  metricCases: Record<string, string>;
  metricValue?: (name: string, timestamp: number) => number;
};
let elbScenario: ElbScenario | undefined;
const useElbScenario = (names = Array.from({ length: 10 }, (_, index) => `alb-${index}`)): ElbScenario => {
  // Freeze the observation date while allowing admission waits to refill quota tokens.
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-09-07T12:00:00.000Z'));
  elbScenario = { names, includeTargets: false, metricCases: {} };
  return elbScenario;
};

let authorizations: string[];
let denyVolumes: boolean;
let denyIdentity: boolean;
let includeNewVolume: boolean;
let viewScope: string | undefined;
let requests: Array<{ hostname: string; operation: string }>;
let metricRequests: Array<{ start: number; end: number; queryCount: number; datapoints: number }>;
let unexpected: string[];
let debugMessages: string[];
let admissionDirectory: string;
let enabledRegions: string[] | undefined;
let holdOperation: string | undefined;
let holdLastCatalogPage: boolean;
let failOperation: string | undefined;
let transientOperation: string | undefined;
let transientHostname: string | undefined;
let transientStatusCode: number;
let transientFailures: number;
let held: Array<{ region: string; signal: AbortSignal; release: () => void }>;
let aggregatorIndex: boolean;
let denyHubActionType: string | undefined;
let hubEnrollmentStatus: 'Active' | 'Inactive';
let optInOperation: string | undefined;
let lambdaCatalogResources: unknown[];
let lambdaFunctionsByRegion: Record<string, unknown[]>;
let lambdaRecommendationsByRegion: Record<string, unknown[]>;
let untaggedResources: unknown[];
let savingsPlansCoverageResponse: unknown;
let savingsPlansDataUnavailable: boolean;

beforeEach(() => {
  elbScenario = undefined;
  authorizations = [];
  enabledRegions = undefined;
  holdOperation = undefined;
  holdLastCatalogPage = false;
  failOperation = undefined;
  transientOperation = undefined;
  transientHostname = undefined;
  transientStatusCode = 500;
  transientFailures = Number.POSITIVE_INFINITY;
  held = [];
  aggregatorIndex = false;
  denyHubActionType = undefined;
  hubEnrollmentStatus = 'Active';
  optInOperation = undefined;
  lambdaCatalogResources = [];
  lambdaFunctionsByRegion = {};
  lambdaRecommendationsByRegion = {};
  untaggedResources = [];
  savingsPlansCoverageResponse = { SavingsPlansCoverages: [] };
  savingsPlansDataUnavailable = false;
  denyVolumes = false;
  denyIdentity = false;
  includeNewVolume = false;
  viewScope = undefined;
  requests = [];
  metricRequests = [];
  unexpected = [];
  debugMessages = [];
  admissionDirectory = mkdtempSync(join(tmpdir(), 'cloudburn-discovery-http-'));
  vi.stubEnv('CLOUDBURN_AWS_ADMISSION_DIR', admissionDirectory);
  vi.stubEnv('CI', 'true');
  vi.stubEnv('AWS_REGION', 'eu-west-1');
  vi.stubEnv('AWS_ACCESS_KEY_ID', 'SYNTHETIC');
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'synthetic-test-key');
  vi.stubEnv('AWS_DEFAULT_REGION', '');
  vi.stubEnv('aws_region', '');
  vi.stubEnv('AWS_CONFIG_FILE', '/dev/null');
  vi.stubEnv('AWS_SHARED_CREDENTIALS_FILE', '/dev/null');
  const probe = new EC2Client({ region: 'eu-west-1' });
  const transport: typeof probe.config.requestHandler = Object.getPrototypeOf(probe.config.requestHandler);
  probe.destroy();
  vi.spyOn(transport, 'handle').mockImplementation(async (request: HttpRequest, options?: HttpHandlerOptions) => {
    authorizations.push(request.headers.authorization ?? '');
    const body = decodeRequestBody(request.body ?? '');
    const operation =
      request.headers['x-amz-target']?.split('.').at(-1) ??
      (request.path === '/' ? (new URLSearchParams(body).get('Action') ?? '') : request.path.slice(1));
    requests.push({ hostname: request.hostname, operation });
    if (
      operation === transientOperation &&
      (!transientHostname || request.hostname === transientHostname) &&
      transientFailures-- > 0
    ) {
      const errorType = transientStatusCode === 429 ? 'ThrottlingException' : 'InternalServerException';
      return {
        response: {
          statusCode: transientStatusCode,
          headers: { 'content-type': 'application/json', 'x-amzn-errortype': errorType },
          body: Buffer.from(JSON.stringify({ message: 'Synthetic retryable failure' })),
        },
      };
    }
    if (operation === optInOperation) {
      return {
        response: {
          statusCode: 400,
          headers: { 'content-type': 'application/json', 'x-amzn-errortype': 'OptInRequiredException' },
          body: Buffer.from('{"message":"Synthetic opt-in required"}'),
        },
      };
    }
    if (operation === failOperation) {
      return {
        response: {
          statusCode: 403,
          headers: { 'content-type': 'application/json', 'x-amzn-errortype': 'AccessDeniedException' },
          body: Buffer.from('{"message":"Synthetic denial"}'),
        },
      };
    }
    if (operation === holdOperation && (!holdLastCatalogPage || JSON.parse(body).NextToken)) {
      return new Promise((resolve, reject) => {
        const signal = options?.abortSignal as AbortSignal;
        const onAbort = () => reject(signal.reason);
        signal?.addEventListener('abort', onAbort, { once: true });
        held.push({
          region: request.hostname.split('.')[1] as string,
          signal,
          release: () => {
            signal?.removeEventListener('abort', onAbort);
            resolve({
              response:
                operation === 'DescribeVolumes'
                  ? {
                      statusCode: 200,
                      headers: { 'content-type': 'text/xml' },
                      body: Buffer.from(fixture('volumes.xml')),
                    }
                  : {
                      statusCode: 200,
                      headers: { 'content-type': 'application/json' },
                      body: Buffer.from(operation === 'ListResources' ? fixture('resources-last.json') : '{}'),
                    },
            });
          },
        });
      });
    }
    if (operation === 'GetAnomalyMonitors') return jsonResponse({ AnomalyMonitors: [] });
    if (request.hostname === 'cost-optimization-hub.us-east-1.amazonaws.com') {
      if (operation === 'ListEnrollmentStatuses') {
        return jsonResponse({ items: [{ accountId: '222222222222', status: hubEnrollmentStatus }] });
      }
      if (operation === 'ListRecommendations') {
        const input = body ? JSON.parse(body) : {};
        const actionTypes = (input.filter?.actionTypes ?? []) as string[];
        if (denyHubActionType && actionTypes.includes(denyHubActionType)) {
          return {
            response: {
              statusCode: 403,
              headers: { 'content-type': 'application/json', 'x-amzn-errortype': 'AccessDeniedException' },
              body: Buffer.from('{"message":"Synthetic hub denial"}'),
            },
          };
        }
        return jsonResponse({ items: [] });
      }
    }
    if (request.hostname === 'budgets.us-east-1.amazonaws.com' && operation === 'DescribeBudgets') {
      return jsonResponse({ Budgets: [] });
    }
    if (request.hostname === 'ce.us-east-1.amazonaws.com' && operation === 'GetCostAndUsage') {
      return jsonResponse({ ResultsByTime: [] });
    }
    if (request.hostname === 'ce.us-east-1.amazonaws.com' && operation === 'GetSavingsPlansCoverage') {
      if (savingsPlansDataUnavailable) {
        return {
          response: {
            statusCode: 400,
            headers: { 'content-type': 'application/json', 'x-amzn-errortype': 'DataUnavailableException' },
            body: Buffer.from('{"message":"Synthetic data unavailable"}'),
          },
        };
      }
      return jsonResponse(savingsPlansCoverageResponse);
    }
    if (
      request.hostname.startsWith('lambda.') &&
      request.method === 'GET' &&
      ['/2015-03-31/functions', '/2015-03-31/functions/'].includes(request.path)
    ) {
      const hostRegion = request.hostname.split('.')[1] ?? '';
      return jsonResponse({ Functions: lambdaFunctionsByRegion[hostRegion] ?? [] });
    }
    if (request.hostname.startsWith('compute-optimizer.') && operation === 'GetLambdaFunctionRecommendations') {
      const hostRegion = request.hostname.split('.')[1] ?? '';
      return jsonResponse({ lambdaFunctionRecommendations: lambdaRecommendationsByRegion[hostRegion] ?? [] });
    }
    if (request.hostname.startsWith('resource-explorer-2.')) {
      if (operation === 'ListSupportedResourceTypes') {
        const input = body ? JSON.parse(body) : request.query;
        return {
          response: {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: Buffer.from(
              JSON.stringify(
                input.NextToken
                  ? { ResourceTypes: [{ ResourceType: 'ec2:volume', Service: 'ec2' }] }
                  : { ResourceTypes: [{ ResourceType: 's3:bucket', Service: 's3' }], NextToken: 'page-two' },
              ),
            ),
          },
        };
      }
      if (operation === 'ListIndexes') {
        const hostRegion = request.hostname.split('.')[1] ?? 'eu-west-1';
        return jsonResponse({
          Indexes: [
            {
              Arn: `arn:aws:resource-explorer-2:${hostRegion}:111111111111:index/00000000-0000-0000-0000-000000000000`,
              Region: hostRegion,
              Type: 'LOCAL',
            },
            ...(aggregatorIndex
              ? [
                  {
                    Arn: `arn:aws:resource-explorer-2:eu-west-1:111111111111:index/aggregator-0000-0000-0000-000000000000`,
                    Region: 'eu-west-1',
                    Type: 'AGGREGATOR',
                  },
                ]
              : []),
          ],
        });
      }
      if (operation === 'GetDefaultView') return jsonFixture('default-view.json');
      if (operation === 'GetView') {
        const value = JSON.parse(fixture('view.json'));
        if (viewScope) value.View.Scope = viewScope;
        return jsonResponse(value);
      }
      if (operation === 'ListResources') {
        const filterInput = body ? JSON.parse(body) : request.query;
        const filterString = filterInput.Filters?.FilterString ?? '';
        if (filterString.includes('tag:none')) return jsonResponse({ Resources: untaggedResources });
        if (filterString.includes('lambda:function')) return jsonResponse({ Resources: lambdaCatalogResources });
        if (elbScenario) {
          return jsonResponse({
            Resources: [
              ...elbScenario.names.map((name) => ({
                Arn: loadBalancerArn(name),
                OwningAccountId: '111111111111',
                Region: 'eu-west-1',
                ResourceType: `elasticloadbalancing:loadbalancer/${prefix(name)}`,
                Service: 'elasticloadbalancing',
              })),
              ...(elbScenario.includeTargets
                ? elbScenario.names.map((name) => ({
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
        const input = body ? JSON.parse(body) : request.query;
        const value = JSON.parse(fixture(input.NextToken ? 'resources-last.json' : 'resources-first.json'));
        if (holdLastCatalogPage && !input.NextToken) value.Resources = [];
        if (includeNewVolume && input.NextToken)
          value.Resources.push({
            ...value.Resources[0],
            Arn: 'arn:aws:ec2:eu-west-1:111111111111:volume/vol-not-discovered',
          });
        return jsonResponse(value);
      }
    }
    if (request.hostname === 'sts.eu-west-1.amazonaws.com' && operation === 'GetCallerIdentity') {
      return {
        response: {
          statusCode: denyIdentity ? 403 : 200,
          headers: { 'content-type': 'text/xml' },
          body: Buffer.from(
            denyIdentity
              ? '<ErrorResponse><Error><Code>AccessDenied</Code><Message>Synthetic identity failure</Message></Error><RequestId>synthetic-request</RequestId></ErrorResponse>'
              : fixture('caller-identity.xml'),
          ),
        },
      };
    }
    if (request.hostname === 'ec2.eu-west-1.amazonaws.com' && operation === 'DescribeRegions') {
      return {
        response: {
          statusCode: 200,
          headers: { 'content-type': 'text/xml' },
          body: Buffer.from(
            enabledRegions
              ? `<DescribeRegionsResponse><regionInfo>${enabledRegions.map((region) => `<item><regionName>${region}</regionName></item>`).join('')}</regionInfo></DescribeRegionsResponse>`
              : fixture('regions.xml'),
          ),
        },
      };
    }
    if (request.hostname === 'ec2.eu-west-1.amazonaws.com' && operation === 'DescribeVolumes') {
      return {
        response: {
          statusCode: denyVolumes ? 403 : 200,
          headers: { 'content-type': 'text/xml' },
          body: Buffer.from(
            denyVolumes
              ? '<Response><Errors><Error><Code>UnauthorizedOperation</Code><Message>Denied by the synthetic policy</Message></Error></Errors><RequestID>synthetic-request</RequestID></Response>'
              : fixture('volumes.xml'),
          ),
        },
      };
    }
    if (elbScenario && request.hostname === 'elasticloadbalancing.eu-west-1.amazonaws.com') {
      const input = new URLSearchParams(body);
      if (operation === 'DescribeTargetGroups' && input.has('LoadBalancerArn')) {
        const name = input.get('LoadBalancerArn')?.split('/')[2] ?? '';
        return xmlResponse(
          operation,
          `<TargetGroups>${elbScenario.includeTargets ? `<member><TargetGroupArn>${targetGroupArn(name)}</TargetGroupArn></member>` : ''}</TargetGroups>`,
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
    if (elbScenario && request.hostname === 'monitoring.eu-west-1.amazonaws.com' && operation === 'GetMetricData') {
      const { metricCases, metricValue } = elbScenario;
      const input = JSON.parse(body) as {
        StartTime: number;
        EndTime: number;
        MetricDataQueries: Array<{
          Id: string;
          MetricStat: { Period: number; Metric: { Dimensions: Array<{ Name: string; Value: string }> } };
        }>;
      };
      const response = {
        MetricDataResults: input.MetricDataQueries.flatMap((query) => {
          const name = query.MetricStat.Metric.Dimensions[0]?.Value.split('/')[1] ?? '';
          const status = metricCases[name] ?? 'Complete';
          if (status === 'Missing') return [];
          const timestamps =
            status === 'Empty'
              ? []
              : Array.from(
                  { length: Math.ceil((input.EndTime - input.StartTime) / query.MetricStat.Period) },
                  (_, index) => input.StartTime + index * query.MetricStat.Period,
                );
          return {
            Id: query.Id,
            StatusCode: status === 'Empty' ? 'Complete' : status,
            Timestamps: timestamps,
            Values: timestamps.map((timestamp) => metricValue?.(name, timestamp) ?? 5),
          };
        }),
      };
      metricRequests.push({
        start: input.StartTime,
        end: input.EndTime,
        queryCount: input.MetricDataQueries.length,
        datapoints: response.MetricDataResults.reduce((sum, result) => sum + result.Values.length, 0),
      });
      return jsonResponse(response);
    }
    const description = `${request.method} ${request.hostname}${request.path}`;
    unexpected.push(description);
    throw new Error(`Unexpected offline AWS request: ${description}`);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(admissionDirectory, { recursive: true, force: true });
  expect(unexpected).toEqual([]);
});

const discover = (ruleId = 'CLDBRN-AWS-EBS-1') =>
  new CloudBurnClient({ debugLogger: (message) => debugMessages.push(message) }).discover({
    target: { mode: 'regions', regions: ['eu-west-1'] },
    config: { discovery: { enabledRules: [ruleId] } },
    aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
    includeEvaluationResources: true,
  });

const volumeAttempt = () =>
  debugMessages
    .filter((message) => message.startsWith('aws: attempt '))
    .map((message) => JSON.parse(message.slice(13)))
    .find((attempt) => attempt.operation === 'DescribeVolumes');

it('discovers through real AWS serialization, catalog pagination, hydration and rule evaluation', async () => {
  const result = await discover();
  expect(result.providers[0]?.rules[0]?.findings).toEqual([
    {
      accountId: '111111111111',
      actionType: 'Upgrade',
      recommendation: {
        opportunityId: '["opportunity",1,"aws","111111111111","eu-west-1","ec2:volume","vol-legacy","Upgrade"]',
        resourceKey: '["resource",1,"aws","111111111111","eu-west-1","ec2:volume","vol-legacy"]',
        source: 'cloudburn',
      },
      region: 'eu-west-1',
      resourceId: 'vol-legacy',
      resourceType: 'ec2:volume',
    },
  ]);
  expect(result.evaluations?.resourceSets[0]?.resources.map((resource) => resource.resourceId).sort()).toEqual([
    'vol-current',
    'vol-legacy',
  ]);
  expect(result.diagnostics).toBeUndefined();
  expect(requests.filter((request) => request.operation === 'ListResources')).toHaveLength(2);
  expect(requests.filter((request) => request.operation === 'DescribeVolumes')).toHaveLength(1);
  expect(requests.filter((request) => request.operation === 'GetCallerIdentity')).toHaveLength(1);
  // Findings retain their resource account; quotas use the signing caller's account.
  expect(volumeAttempt()).toMatchObject({
    quota: { accountId: '222222222222' },
    attribution: { dataset: 'aws-ebs-volumes', datasets: ['aws-ebs-volumes'] },
  });
});

// Public cancellation rejects promptly; let the detached request release its
// SQLite lease before this fixture deletes its private admission directory.
const waitForCancelledCatalogCleanup = async () => {
  if (held.length === 0) return;
  await vi.waitFor(() =>
    expect(
      debugMessages
        .filter((message) => message.startsWith('aws: attempt '))
        .map((message) => JSON.parse(message.slice('aws: attempt '.length)))
        .some(
          (attempt) =>
            attempt.operation === 'ListResources' &&
            attempt.outcome === 'cancelled' &&
            attempt.cleanupOutcome === 'released',
        ),
    ).toBe(true),
  );
};

it('collects independent account evidence while catalog pagination is blocked', async () => {
  holdOperation = 'ListResources';
  const controller = new AbortController();
  const scan = new CloudBurnClient({ debugLogger: (message) => debugMessages.push(message) }).discover({
    signal: controller.signal,
    aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
    target: { mode: 'region', region },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1', 'CLDBRN-AWS-COSTGUARDRAILS-2'] } },
  });
  const outcome = scan.catch((error: unknown) => error);
  try {
    await vi.waitFor(() => expect(held.length).toBeGreaterThan(0), { timeout: 4000 });
    await vi.waitFor(() => expect(requests.some(({ operation }) => operation === 'GetAnomalyMonitors')).toBe(true));
  } finally {
    controller.abort();
    await outcome;
    await waitForCancelledCatalogCleanup();
  }
});

it('reports provisional evaluated findings before unrelated hydration completes', async () => {
  holdOperation = 'DescribeVolumes';
  const events: AwsDiscoveryProgressEvent[] = [];
  const controller = new AbortController();
  const scan = new CloudBurnClient({ debugLogger: (message) => debugMessages.push(message) }).discover({
    signal: controller.signal,
    aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
    target: { mode: 'region', region },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1', 'CLDBRN-AWS-COSTGUARDRAILS-2'] } },
    includeEvaluationResources: true,
    onProgress: (event) => events.push(event),
  });
  const outcome = scan.catch((error: unknown) => error);
  try {
    await vi.waitFor(() => expect(held.length).toBeGreaterThan(0), { timeout: 4000 });
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: 'rule',
        ruleId: 'CLDBRN-AWS-COSTGUARDRAILS-2',
        provisional: true,
        status: 'triggered',
        findingCount: 1,
      }),
    );
    expect(events.filter((event) => event.kind === 'rule')).toHaveLength(1);
    held[0]?.release();
    const result = await scan;
    expect(result.providers.flatMap((provider) => provider.rules).map((rule) => rule.ruleId)).toEqual([
      'CLDBRN-AWS-COSTGUARDRAILS-2',
      'CLDBRN-AWS-EBS-1',
    ]);
    expect(events.filter((event) => event.kind === 'rule')).toHaveLength(2);
    const timingLog = debugMessages.find((message) => message.startsWith('sdk: live scan timing '));
    expect(timingLog).toBeDefined();
    const timing = JSON.parse(timingLog?.slice('sdk: live scan timing '.length) ?? '{}');
    expect(timing.firstRuleMs).toBe(events.find((event) => event.kind === 'rule')?.elapsedMs);
    expect(timing.totalMs).toBeGreaterThan(timing.firstRuleMs);
  } finally {
    controller.abort();
    await outcome;
  }
});

it('evaluates a cached catalog scope while an unrelated catalog miss is blocked', async () => {
  const client = new CloudBurnClient({ debugLogger: (message) => debugMessages.push(message) });
  const cache = { directory: join(admissionDirectory, 'evidence'), authorizationContext: 'synthetic-policy-v1' };
  const aws = { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } };
  await client.discover({
    cache,
    aws,
    target: { mode: 'region', region },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1'] } },
  });
  holdOperation = 'ListResources';
  const controller = new AbortController();
  const events: AwsDiscoveryProgressEvent[] = [];
  const scan = client.discover({
    cache,
    aws,
    signal: controller.signal,
    target: { mode: 'region', region },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1', 'CLDBRN-AWS-CLOUDWATCH-1'] } },
    onProgress: (event) => events.push(event),
  });
  const outcome = scan.catch((error: unknown) => error);
  try {
    await vi.waitFor(() => expect(held.length).toBeGreaterThan(0), { timeout: 4000 });
    await vi.waitFor(() =>
      expect(events).toContainEqual(
        expect.objectContaining({
          kind: 'rule',
          ruleId: 'CLDBRN-AWS-EBS-1',
          status: 'triggered',
          findingCount: 1,
        }),
      ),
    );
    expect(events.some((event) => event.kind === 'catalog')).toBe(false);
  } finally {
    controller.abort();
    await outcome;
    await waitForCancelledCatalogCleanup();
  }
});

it('never evaluates absence from an empty catalog page with more pages pending', async () => {
  holdOperation = 'ListResources';
  holdLastCatalogPage = true;
  const events: AwsDiscoveryProgressEvent[] = [];
  const controller = new AbortController();
  const scan = new CloudBurnClient().discover({
    signal: controller.signal,
    aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
    target: { mode: 'region', region },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1'] } },
    onProgress: (event) => events.push(event),
  });
  const outcome = scan.catch((error: unknown) => error);
  try {
    await vi.waitFor(() => expect(held).toHaveLength(1), { timeout: 4000 });
    expect(events).toEqual([]);
    expect(requests.some(({ operation }) => operation === 'DescribeVolumes')).toBe(false);
    held[0]?.release();
    const result = await scan;
    expect(result.providers[0]?.rules[0]?.findings).toEqual([
      {
        accountId,
        actionType: 'Upgrade',
        recommendation: {
          opportunityId: '["opportunity",1,"aws","111111111111","eu-west-1","ec2:volume","vol-legacy","Upgrade"]',
          resourceKey: '["resource",1,"aws","111111111111","eu-west-1","ec2:volume","vol-legacy"]',
          source: 'cloudburn',
        },
        region,
        resourceId: 'vol-legacy',
        resourceType: 'ec2:volume',
      },
    ]);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'rule', status: 'triggered', findingCount: 1 }));
  } finally {
    controller.abort();
    await outcome;
  }
});

it('rejects cancellation after useful progress and stops active transport and later events', async () => {
  holdOperation = 'DescribeVolumes';
  const controller = new AbortController();
  const events: AwsDiscoveryProgressEvent[] = [];
  const scan = new CloudBurnClient().discover({
    signal: controller.signal,
    aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
    target: { mode: 'region', region },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1', 'CLDBRN-AWS-COSTGUARDRAILS-2'] } },
    onProgress: (event) => events.push(event),
  });
  const outcome = scan.catch((error: unknown) => error);
  try {
    await vi.waitFor(() => expect(held).toHaveLength(1), { timeout: 4000 });
    expect(events.some((event) => event.kind === 'rule')).toBe(true);
    const eventCount = events.length;
    const requestCount = requests.length;
    controller.abort();
    expect(await outcome).toMatchObject({ name: 'AbortError' });
    expect(held[0]?.signal.aborted).toBe(true);
    held[0]?.release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(events).toHaveLength(eventCount);
    expect(requests).toHaveLength(requestCount);
  } finally {
    controller.abort();
    await outcome;
  }
});

it('reuses complete evidence across scans while re-evaluating rule selection', async () => {
  const client = new CloudBurnClient();
  const options: RegionsCacheDiscoverOptions = {
    target: { mode: 'regions', regions: ['eu-west-1'] },
    cache: { directory: join(admissionDirectory, 'evidence'), authorizationContext: 'synthetic-policy-v1' },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1'] } },
    includeEvaluationResources: true,
  };
  const first = await client.discover(options);
  const second = await client.discover({
    ...options,
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-2'] } },
  });
  expect(first.providers[0]?.rules[0]?.ruleId).toBe('CLDBRN-AWS-EBS-1');
  expect(second.evaluations?.rules[0]?.ruleId).toBe('CLDBRN-AWS-EBS-2');
  expect(requests.filter(({ operation }) => operation === 'DescribeVolumes')).toHaveLength(1);
  expect(requests.filter(({ operation }) => operation === 'ListResources')).toHaveLength(2);
  expect(second.evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ datasetKey: 'aws-ebs-volumes', source: 'cache', complete: true }),
    ]),
  );
});

describe('reusable evidence isolation and freshness', () => {
  const options = (): RegionsCacheDiscoverOptions => ({
    target: { mode: 'regions', regions: ['eu-west-1'] },
    cache: { directory: join(admissionDirectory, 'evidence'), authorizationContext: 'policy-v1' },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1'] } },
    includeEvaluationResources: true,
  });

  it('leaves SDK reuse off unless explicitly configured with a safe authorization scope', async () => {
    const client = new CloudBurnClient();
    const { cache, ...uncached } = options();
    await client.discover(uncached);
    await client.discover(uncached);
    expect(existsSync(cache.directory)).toBe(false);
    await client.discover({ ...uncached, cache: { directory: cache.directory } });
    await client.discover({ ...uncached, cache: { directory: cache.directory } });
    expect(existsSync(cache.directory)).toBe(false);
    expect(requests.filter(({ operation }) => operation === 'DescribeVolumes')).toHaveLength(4);
  });

  it('isolates distinct credential sessions with the same account and role identity', async () => {
    const client = new CloudBurnClient();
    const { cache, ...scan } = options();
    const session = (sessionToken: string) => ({
      ...scan,
      cache: { directory: cache.directory },
      aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key', sessionToken } },
    });
    await client.discover(session('policy-session-a'));
    await client.discover(session('policy-session-b'));
    const reused = await client.discover(session('policy-session-a'));
    expect(requests.filter(({ operation }) => operation === 'DescribeVolumes')).toHaveLength(2);
    expect(reused.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ datasetKey: 'aws-ebs-volumes', source: 'cache' })]),
    );
    expect(requests.filter(({ operation }) => operation === 'GetCallerIdentity')).toHaveLength(3);
  });

  it('supports explicitly configured SDK memory reuse and changing permission revisions', async () => {
    const client = new CloudBurnClient();
    const scan = { ...options(), cache: { authorizationContext: 'policy-v1' } };
    await client.discover(scan);
    await client.discover(scan);
    await client.discover({ ...scan, cache: { authorizationContext: 'policy-v2' } });
    expect(requests.filter(({ operation }) => operation === 'DescribeVolumes')).toHaveLength(2);
  });

  it('disables customer reuse while retaining discovery when identity validation is unavailable', async () => {
    denyIdentity = true;
    const scan = options();
    const result = await new CloudBurnClient().discover(scan);
    expect(result.providers[0]?.rules[0]?.findings).toHaveLength(1);
    expect(existsSync(scan.cache.directory)).toBe(false);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ datasetKey: 'aws-ebs-volumes', source: 'live', cacheStatus: 'off' }),
      ]),
    );
  });

  it('never silently falls back on a denied strict refresh or makes it current complete evidence', async () => {
    const client = new CloudBurnClient();
    const scan = options();
    await client.discover(scan);
    denyVolumes = true;
    const denied = await client.discover({ ...scan, cache: { ...scan.cache, mode: 'refresh' } });
    expect(denied.providers).toEqual([]);
    expect(denied.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'access_denied' })]));
    expect(denied.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ datasetKey: 'aws-ebs-volumes', complete: false, source: 'live' }),
      ]),
    );
    const again = await client.discover({ ...scan, cache: { ...scan.cache, mode: 'refresh' } });
    expect(again.providers).toEqual([]);
    expect(requests.filter(({ operation }) => operation === 'DescribeVolumes')).toHaveLength(3);
  });

  it('off bypasses existing evidence and performs no new persistent writes', async () => {
    const client = new CloudBurnClient();
    const scan = options();
    await client.discover({ ...scan, cache: { ...scan.cache, mode: 'off' } });
    expect(existsSync(scan.cache.directory)).toBe(false);
    await client.discover(scan);
    await client.discover({ ...scan, cache: { ...scan.cache, mode: 'off' } });
    expect(requests.filter(({ operation }) => operation === 'DescribeVolumes')).toHaveLength(3);
  });

  it('invalidates hydration when an expired catalog discovers a new resource', async () => {
    const client = new CloudBurnClient();
    const scan = options();
    await client.discover(scan);
    includeNewVolume = true;
    const changed = await client.discover({ ...scan, cache: { ...scan.cache, ttlMs: { catalog: 0 } } });
    expect(changed.providers[0]?.rules[0]?.findings.map(({ resourceId }) => resourceId)).toContain(
      'vol-not-discovered',
    );
    expect(requests.filter(({ operation }) => operation === 'DescribeVolumes')).toHaveLength(2);
    expect(requests.filter(({ operation }) => operation === 'ListResources')).toHaveLength(4);
  });

  it('invalidates hydration when the view scope changes even with identical resources and ARN', async () => {
    const client = new CloudBurnClient();
    const scan = options();
    await client.discover(scan);
    viewScope = 'arn:aws:organizations::222222222222:organization/o-synthetic';
    await client.discover(scan);
    expect(requests.filter(({ operation }) => operation === 'DescribeVolumes')).toHaveLength(2);
  });

  it('keeps a shared hydration alive when its first scan is cancelled', async () => {
    holdOperation = 'DescribeVolumes';
    const firstController = new AbortController();
    const client = new CloudBurnClient({ debugLogger: (message) => debugMessages.push(message) });
    const first = client.discover({ ...options(), signal: firstController.signal });
    const cancelled = expect(first).rejects.toThrow('first scan cancelled');
    await vi.waitFor(() => expect(held).toHaveLength(1), { timeout: 10_000 });
    const second = client.discover(options());
    await vi.waitFor(() => expect(requests.filter(({ operation }) => operation === 'GetView')).toHaveLength(2), {
      timeout: 10_000,
    });
    await vi.waitFor(() =>
      expect(
        debugMessages.filter((message) => message === 'aws: evidence lookup aws-ebs-volumes in eu-west-1'),
      ).toHaveLength(2),
    );
    firstController.abort(new Error('first scan cancelled'));
    await cancelled;
    expect(held[0]?.signal.aborted).toBe(false);
    held[0]?.release();
    expect((await second).providers[0]?.rules[0]?.findings).toHaveLength(1);
    expect(requests.filter(({ operation }) => operation === 'DescribeVolumes')).toHaveLength(1);
  });

  it('retains unknown resource coverage and recollects incomplete metrics on the next scan', async () => {
    const scenario = useElbScenario(['alb-complete', 'alb-partial']);
    scenario.includeTargets = true;
    scenario.metricCases['alb-partial'] = 'PartialData';
    const client = new CloudBurnClient();
    const scan = { ...options(), config: { discovery: { enabledRules: ['CLDBRN-AWS-ELB-5'] } } };
    const first = await client.discover(scan);
    const second = await client.discover(scan);
    const activity = second.evidence?.find(({ datasetKey }) => datasetKey === 'aws-ec2-load-balancer-request-activity');
    expect(first.evaluations?.rules[0]?.coverage?.unknown.length).toBeGreaterThan(0);
    expect(activity).toMatchObject({ complete: false, source: 'live' });
    expect(activity?.coverage?.unknown.length).toBeGreaterThan(0);
    expect(requests.filter(({ operation }) => operation === 'DescribeLoadBalancers')).toHaveLength(1);
    // PartialData uses three bounded query attempts per scan.
    expect(requests.filter(({ operation }) => operation === 'GetMetricData')).toHaveLength(6);
  });
});

it('retains discovery results with per-run quotas when the caller identity lookup fails', async () => {
  denyIdentity = true;
  const result = await discover();

  expect(result.providers[0]?.rules[0]?.findings).toEqual([
    {
      accountId: '111111111111',
      actionType: 'Upgrade',
      recommendation: {
        opportunityId: '["opportunity",1,"aws","111111111111","eu-west-1","ec2:volume","vol-legacy","Upgrade"]',
        resourceKey: '["resource",1,"aws","111111111111","eu-west-1","ec2:volume","vol-legacy"]',
        source: 'cloudburn',
      },
      region: 'eu-west-1',
      resourceId: 'vol-legacy',
      resourceType: 'ec2:volume',
    },
  ]);
  expect(requests.filter((request) => request.operation === 'GetCallerIdentity')).toHaveLength(1);
  expect(volumeAttempt()).toMatchObject({ quota: { accountId: expect.stringMatching(/^unresolved:/) } });
});

it('reports denied required AWS evidence as unavailable rather than a passed check', async () => {
  denyVolumes = true;
  const result = await discover();
  expect(result.providers).toEqual([]);
  expect(result.evaluations?.rules).toEqual([
    expect.objectContaining({ ruleId: 'CLDBRN-AWS-EBS-1', status: 'not_applicable' }),
  ]);
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: 'UnauthorizedOperation' })]),
  );
});

describe('ELB request activity', () => {
  it('reuses historical metrics on rollover while late activity matches a full-window scan', async () => {
    const scenario = useElbScenario(['idle', 'late-activity']);
    scenario.includeTargets = true;
    const client = new CloudBurnClient({ debugLogger: (message) => debugMessages.push(message) });
    const scan = {
      target: { mode: 'region' as const, region },
      cache: {
        directory: join(admissionDirectory, 'metric-evidence'),
        authorizationContext: 'synthetic-policy-v1',
        ttlMs: { datasets: { 'aws-ec2-load-balancer-request-activity': 0 } },
      },
      config: { discovery: { enabledRules: ['CLDBRN-AWS-ELB-5'] } },
      includeEvaluationResources: true,
    };
    const first = await client.discover(scan);
    expect(first.providers[0]?.rules[0]?.findings).toEqual([identity('idle'), identity('late-activity')]);
    expect(metricRequests).toEqual([
      {
        start: Date.parse('2026-08-24T00:00:00Z') / 1000,
        end: Date.parse('2026-09-07T00:00:00Z') / 1000,
        queryCount: 2,
        datapoints: 28,
      },
    ]);

    const repeated = await client.discover(scan);
    expect(repeated.providers).toEqual(first.providers);
    expect(repeated.evaluations).toEqual(first.evaluations);
    expect(metricRequests).toHaveLength(1);

    // A revised closed day changes the late-activity ALB's 14-day average from 5 to above 10.
    scenario.metricValue = (name, timestamp) =>
      name === 'late-activity' && timestamp === Date.parse('2026-09-06T00:00:00Z') / 1000 ? 200 : 5;
    vi.setSystemTime(new Date('2026-09-08T12:00:00Z'));
    const incremental = await client.discover(scan);
    expect(incremental.providers[0]?.rules[0]?.findings).toEqual([identity('idle')]);
    expect(metricRequests).toHaveLength(2);
    expect(metricRequests[1]).toEqual({
      start: Date.parse('2026-09-05T00:00:00Z') / 1000,
      end: Date.parse('2026-09-08T00:00:00Z') / 1000,
      queryCount: 2,
      datapoints: 6,
    });
    expect(
      debugMessages
        .filter((message) => message.startsWith('aws: attempt '))
        .map((message) => JSON.parse(message.slice(13))),
    ).toContainEqual(
      expect.objectContaining({
        type: 'metric-cache',
        cacheHits: 22,
        datapointsReused: 22,
        datapointsFetched: 6,
      }),
    );

    const baseline = await client.discover({ ...scan, cache: { ...scan.cache, mode: 'off' } });
    expect(incremental.providers).toEqual(baseline.providers);
    expect(incremental.evaluations).toEqual(baseline.evaluations);
    expect(incremental.diagnostics).toEqual(baseline.diagnostics);
    expect(metricRequests).toHaveLength(3);
    expect(metricRequests[2]).toEqual({
      start: Date.parse('2026-08-25T00:00:00Z') / 1000,
      end: Date.parse('2026-09-08T00:00:00Z') / 1000,
      queryCount: 2,
      datapoints: 28,
    });
  });

  it('loads inventory plus activity for ten ALBs with eleven metadata calls, counting health and metrics separately', async () => {
    useElbScenario();
    const result = await discover('CLDBRN-AWS-ELB-5');

    expect(result.diagnostics ?? []).toEqual([]);
    expect(result.evaluations?.rules[0]?.coverage?.assessed).toHaveLength(10);
    expect(requests.filter(({ operation }) => operation === 'DescribeTargetGroups')).toHaveLength(10);
    expect(requests.filter(({ operation }) => operation === 'DescribeLoadBalancers')).toHaveLength(1);
    expect(requests.filter(({ operation }) => operation === 'DescribeTargetHealth')).toHaveLength(0);
    expect(requests.filter(({ operation }) => operation === 'GetMetricData')).toHaveLength(1);
  });

  it.each(['PartialData', 'Forbidden', 'InternalError', 'Missing', 'Empty'])(
    'retains unknown %s metric evidence beside a valid idle finding',
    async (status) => {
      const scenario = useElbScenario(['idle', 'uncertain']);
      scenario.includeTargets = true;
      scenario.metricCases = { uncertain: status };

      const result = await discover('CLDBRN-AWS-ELB-5');

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
    },
  );

  it('reports NLB and Gateway activity as unknown without sending HTTP metric queries', async () => {
    const scenario = useElbScenario(['net-example', 'gwy-example']);
    scenario.includeTargets = true;

    const result = await discover('CLDBRN-AWS-ELB-5');

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
});

it('owns supported-type clients across pagination and disposes them after success', async () => {
  const destroy = vi.spyOn(ResourceExplorer2Client.prototype, 'destroy');
  const result = await new CloudBurnClient().listSupportedDiscoveryResourceTypes();
  expect(result.map((type) => type.resourceType)).toEqual(['ec2:volume', 's3:bucket']);
  expect(requests.filter((request) => request.operation === 'ListSupportedResourceTypes')).toHaveLength(2);
  expect(destroy).toHaveBeenCalledOnce();
});

it('admits catalog and control-plane requests using the signing account before hydration', async () => {
  await discover();
  const attempts = debugMessages
    .filter((message) => message.startsWith('aws: attempt '))
    .map((message) => JSON.parse(message.slice(13)));
  for (const operation of [
    'DescribeRegions',
    'ListIndexes',
    'GetDefaultView',
    'GetView',
    'ListResources',
    'DescribeVolumes',
  ]) {
    expect(attempts).toContainEqual(
      expect.objectContaining({ operation, quota: expect.objectContaining({ accountId: '222222222222' }) }),
    );
  }
  expect(
    new Set(
      attempts
        .filter((attempt) => attempt.operation !== 'GetCallerIdentity')
        .map((attempt) => attempt.attribution.scanId),
    ).size,
  ).toBe(1);
});

it('bounds status workers to five and preserves deterministic region ordering', async () => {
  enabledRegions = [
    'us-west-2',
    'us-west-1',
    'eu-west-3',
    'eu-west-2',
    'eu-west-1',
    'eu-central-1',
    'ap-south-1',
    'us-east-1',
  ];
  holdOperation = 'ListIndexes';
  const controller = new AbortController();
  const run = new CloudBurnClient().getDiscoveryStatus({ region: 'eu-west-1', signal: controller.signal });
  const settled = run.catch(() => undefined);
  try {
    await vi.waitFor(() => expect(held.length).toBeGreaterThanOrEqual(5));
    expect(held).toHaveLength(5);
    held[3]?.release();
    await vi.waitFor(() => expect(held).toHaveLength(6));
    held[0]?.release();
    held[2]?.release();
    await vi.waitFor(() => expect(held).toHaveLength(8));
    for (const request of held) request.release();
    const result = await run;
    expect(result.regions.map((region) => region.region)).toEqual([...enabledRegions].sort());
    expect(result.regions.every((region) => region.status === 'not_indexed')).toBe(true);
  } finally {
    controller.abort();
    await settled;
  }
});

type Operation = 'discovery' | 'status' | 'setup' | 'supported types';
const invokeOperation = (operation: Operation, options: { signal?: AbortSignal; timeoutMs?: number } = {}) => {
  const client = new CloudBurnClient();
  const execution = {
    ...options,
    aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
  };
  if (operation === 'discovery')
    return client.discover({
      ...execution,
      target: { mode: 'regions', regions: ['eu-west-1'] },
      config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1'] } },
    });
  if (operation === 'status') return client.getDiscoveryStatus({ ...execution, region: 'eu-west-1' });
  if (operation === 'setup') return client.initializeDiscovery({ ...execution, region: 'eu-west-1' });
  return client.listSupportedDiscoveryResourceTypes(execution);
};
const operations: Operation[] = ['discovery', 'status', 'setup', 'supported types'];

it.each(operations)('cancels active %s HTTP work and disposes clients without later dispatch', async (operation) => {
  holdOperation = operation === 'supported types' ? 'ListSupportedResourceTypes' : 'ListIndexes';
  const destroy = vi.spyOn(ResourceExplorer2Client.prototype, 'destroy');
  const destroyIdentity = vi.spyOn(STSClient.prototype, 'destroy');
  const controller = new AbortController();
  const reason = new Error('caller stopped discovery');
  const run = invokeOperation(operation, { signal: controller.signal });
  const assertion = expect(run).rejects.toBe(reason);
  await vi.waitFor(() => expect(held).toHaveLength(1));
  const requestCount = requests.length;
  controller.abort(reason);
  await assertion;
  expect(held[0]?.signal.aborted).toBe(true);
  expect(destroy).toHaveBeenCalledOnce();
  expect(destroyIdentity).toHaveBeenCalledOnce();
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(requests).toHaveLength(requestCount);
});

it.each(operations)('enforces the total %s deadline and aborts active HTTP work', async (operation) => {
  holdOperation = 'GetCallerIdentity';
  const destroy = vi.spyOn(STSClient.prototype, 'destroy');
  await expect(invokeOperation(operation, { timeoutMs: 100 })).rejects.toMatchObject({ name: 'TimeoutError' });
  expect(held).toHaveLength(1);
  expect(held[0]?.signal.aborted).toBe(true);
  expect(destroy).toHaveBeenCalledOnce();
});

it.each(operations)('rejects pre-cancelled %s without creating clients or sending requests', async (operation) => {
  const controller = new AbortController();
  controller.abort();
  await expect(invokeOperation(operation, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(requests).toEqual([]);
});

it.each(operations)('disposes owned clients when %s fails', async (operation) => {
  failOperation = operation === 'supported types' ? 'ListSupportedResourceTypes' : 'DescribeRegions';
  const destroyIdentity = vi.spyOn(STSClient.prototype, 'destroy');
  const destroy = vi.spyOn(
    operation === 'supported types' ? ResourceExplorer2Client.prototype : EC2Client.prototype,
    'destroy',
  );
  await expect(invokeOperation(operation)).rejects.toBeInstanceOf(Error);
  expect(destroyIdentity).toHaveBeenCalledOnce();
  expect(destroy).toHaveBeenCalledOnce();
});

it('cancels regional status without starting queued regions', async () => {
  enabledRegions = [
    'us-west-2',
    'us-west-1',
    'eu-west-3',
    'eu-west-2',
    'eu-west-1',
    'eu-central-1',
    'ap-south-1',
    'us-east-1',
  ];
  holdOperation = 'ListIndexes';
  const controller = new AbortController();
  const assertion = expect(invokeOperation('status', { signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError',
  });
  await vi.waitFor(() => expect(held).toHaveLength(5));
  controller.abort();
  await assertion;
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(held).toHaveLength(5);
  expect(held.every((request) => request.signal.aborted)).toBe(true);
});

it('preserves credentials supplied through the existing public credential scope', async () => {
  await withAwsClientCredentials({ accessKeyId: 'SCOPED', secretAccessKey: 'synthetic-scoped-key' }, () =>
    new CloudBurnClient().listSupportedDiscoveryResourceTypes(),
  );
  expect(authorizations.length).toBeGreaterThan(0);
  expect(authorizations.every((header) => header.includes('Credential=SCOPED/'))).toBe(true);
});

it.each([
  ['ListIndexes', 500],
  ['GetDefaultView', 500],
  ['GetView', 500],
  ['ListIndexes', 429],
  ['GetDefaultView', 429],
  ['GetView', 429],
] as const)('bounds status probe %s to two physical attempts after HTTP %i', async (operation, statusCode) => {
  vi.useFakeTimers();
  // Failed identity uses the existing in-memory fallback, making admission clock-driven.
  denyIdentity = true;
  transientOperation = operation;
  transientStatusCode = statusCode;
  const result = new CloudBurnClient({ debugLogger: (message) => debugMessages.push(message) }).getDiscoveryStatus();
  await vi.waitFor(() => expect(requests.some((request) => request.operation === operation)).toBe(true));
  await vi.advanceTimersByTimeAsync(120_000);
  const status = await result;
  expect(status.regions).toEqual([
    expect.objectContaining(
      operation === 'ListIndexes'
        ? { region: 'eu-west-1', status: 'error' }
        : { region: 'eu-west-1', status: 'indexed', viewStatus: 'error' },
    ),
  ]);
  expect(requests.filter((request) => request.operation === operation)).toHaveLength(2);
  const attempts = debugMessages
    .filter((message) => message.startsWith('aws: attempt '))
    .map((message) => JSON.parse(message.slice(13)))
    .filter((attempt) => attempt.operation === operation);
  expect(attempts.map((attempt) => attempt.retryOutcome)).toEqual(['scheduled', 'exhausted']);
  expect(attempts.every((attempt) => attempt.quota?.group === 'non-search')).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['ListIndexes', 'GetDefaultView', 'GetView'])(
  'recovers status probe %s on its second attempt',
  async (operation) => {
    vi.useFakeTimers();
    denyIdentity = true;
    transientOperation = operation;
    transientFailures = 1;
    const result = new CloudBurnClient().getDiscoveryStatus();
    await vi.waitFor(() => expect(requests.some((request) => request.operation === operation)).toBe(true));
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await result).regions).toEqual([
      expect.objectContaining({ region: 'eu-west-1', status: 'indexed', viewStatus: 'present' }),
    ]);
    expect(requests.filter((request) => request.operation === operation)).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  },
);

describe('live capability outcomes', () => {
  const WRITE_OPERATIONS = [
    'AssociateDefaultView',
    'CreateIndex',
    'CreateResourceExplorerSetup',
    'CreateView',
    'DeleteIndex',
    'DeleteView',
    'DisassociateDefaultView',
    'UpdateEnrollmentStatus',
    'UpdateIndex',
    'UpdateIndexType',
    'UpdateView',
  ];
  const expectReadOnlyRequests = () =>
    expect(requests.filter((request) => WRITE_OPERATIONS.includes(request.operation))).toEqual([]);

  const discoverRules = (ruleIds: string[], target: AwsDiscoveryTarget = { mode: 'regions', regions: ['eu-west-1'] }) =>
    new CloudBurnClient({ debugLogger: (message) => debugMessages.push(message) }).discover({
      target,
      config: { discovery: { enabledRules: ruleIds } },
      aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
      includeEvaluationResources: true,
    });

  const capabilitiesOf = (result: Awaited<ReturnType<typeof discoverRules>>) => result.capabilities ?? [];

  const useLambdaScenario = (regions: string[]) => {
    lambdaCatalogResources = regions.map((region) => ({
      Arn: `arn:aws:lambda:${region}:111111111111:function:fn-${region}`,
      OwningAccountId: '111111111111',
      Region: region,
      ResourceType: 'lambda:function',
      Service: 'lambda',
    }));
    lambdaFunctionsByRegion = Object.fromEntries(
      regions.map((region) => [
        region,
        [
          {
            Architectures: ['x86_64'],
            FunctionArn: `arn:aws:lambda:${region}:111111111111:function:fn-${region}`,
            FunctionName: `fn-${region}`,
            MemorySize: 1024,
            Timeout: 30,
          },
        ],
      ]),
    );
  };

  it('reports Cost Optimization Hub enrollment as available when enrolled with empty recommendations', async () => {
    const result = await discoverRules(['CLDBRN-AWS-COSTOPTIMIZATIONHUB-1', 'CLDBRN-AWS-EBS-1']);

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'cost-optimization-hub-enrollment',
        datasetKeys: ['aws-cost-optimization-hub-savings-plans-recommendations'],
        reasons: [],
        scope: { type: 'account' },
        status: 'available',
      },
    ]);
    expect(result.providers.flatMap((provider) => provider.rules).map((rule) => rule.ruleId)).toEqual([
      'CLDBRN-AWS-EBS-1',
    ]);
    expect(result.evaluations?.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-1', status: 'passed' }),
        expect.objectContaining({ ruleId: 'CLDBRN-AWS-EBS-1', status: 'triggered' }),
      ]),
    );
    expectReadOnlyRequests();
  });

  it('reports Hub enrollment unavailable when the account is not enrolled and retains unrelated findings', async () => {
    hubEnrollmentStatus = 'Inactive';
    const result = await discoverRules(['CLDBRN-AWS-COSTOPTIMIZATIONHUB-1', 'CLDBRN-AWS-EBS-1']);

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'cost-optimization-hub-enrollment',
        datasetKeys: ['aws-cost-optimization-hub-savings-plans-recommendations'],
        reasons: ['not-enrolled'],
        scope: { type: 'account' },
        status: 'unavailable',
      },
    ]);
    expect(result.providers.flatMap((provider) => provider.rules).map((rule) => rule.ruleId)).toEqual([
      'CLDBRN-AWS-EBS-1',
    ]);
    expect(result.evaluations?.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-1', status: 'not_applicable' }),
        expect.objectContaining({ ruleId: 'CLDBRN-AWS-EBS-1', status: 'triggered' }),
      ]),
    );
    expectReadOnlyRequests();
  });

  it('reports Hub enrollment unavailable with access-denied when enrollment status is denied', async () => {
    failOperation = 'ListEnrollmentStatuses';
    const result = await discoverRules(['CLDBRN-AWS-COSTOPTIMIZATIONHUB-1']);

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'cost-optimization-hub-enrollment',
        datasetKeys: ['aws-cost-optimization-hub-savings-plans-recommendations'],
        reasons: ['access-denied'],
        scope: { type: 'account' },
        status: 'unavailable',
      },
    ]);
    expectReadOnlyRequests();
  });

  it('reports Hub enrollment as error when the enrollment status keeps failing', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    transientOperation = 'ListEnrollmentStatuses';
    const result = await discoverRules(['CLDBRN-AWS-COSTOPTIMIZATIONHUB-1']);

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'cost-optimization-hub-enrollment',
        datasetKeys: ['aws-cost-optimization-hub-savings-plans-recommendations'],
        reasons: ['service-error'],
        scope: { type: 'account' },
        status: 'error',
      },
    ]);
    expect(requests.filter((request) => request.operation === 'ListEnrollmentStatuses')).toHaveLength(6);
    expectReadOnlyRequests();
  });

  it('degrades Hub enrollment to partial when one recommendation category is denied', async () => {
    denyHubActionType = 'Upgrade';
    const result = await discoverRules(['CLDBRN-AWS-COSTOPTIMIZATIONHUB-1', 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-5']);

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'cost-optimization-hub-enrollment',
        datasetKeys: [
          'aws-cost-optimization-hub-savings-plans-recommendations',
          'aws-cost-optimization-hub-upgrade-recommendations',
        ],
        reasons: ['access-denied'],
        scope: { type: 'account' },
        status: 'partial',
      },
    ]);
    expectReadOnlyRequests();
  });

  it('degrades Cost Explorer access to partial when one dataset is denied', async () => {
    failOperation = 'GetAnomalyMonitors';
    const result = await discoverRules(['CLDBRN-AWS-COSTEXPLORER-1', 'CLDBRN-AWS-COSTGUARDRAILS-2']);

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'cost-explorer-access',
        datasetKeys: ['aws-cost-anomaly-monitors', 'aws-cost-usage'],
        reasons: ['access-denied'],
        scope: { type: 'account' },
        status: 'partial',
      },
    ]);
    expectReadOnlyRequests();
  });

  it('keeps regional catalog findings working while account tagging lacks an aggregator', async () => {
    const result = await discoverRules(['CLDBRN-AWS-EBS-1', 'CLDBRN-AWS-TAGGING-1']);

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'resource-explorer-aggregator',
        datasetKeys: ['aws-resource-explorer-untagged-resources'],
        reasons: ['aggregator-required'],
        scope: { type: 'account' },
        status: 'unavailable',
      },
    ]);
    expect(result.providers.flatMap((provider) => provider.rules).map((rule) => rule.ruleId)).toEqual([
      'CLDBRN-AWS-EBS-1',
    ]);
    expect(result.evaluations?.rules).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: 'CLDBRN-AWS-TAGGING-1', status: 'not_applicable' })]),
    );
    expectReadOnlyRequests();
  });

  it('reports the tagging capability available when an accessible aggregator answers an empty query', async () => {
    aggregatorIndex = true;
    const result = await discoverRules(['CLDBRN-AWS-TAGGING-1']);

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'resource-explorer-aggregator',
        datasetKeys: ['aws-resource-explorer-untagged-resources'],
        reasons: [],
        scope: { type: 'account' },
        status: 'available',
      },
    ]);
    expect(result.evaluations?.rules).toEqual([
      expect.objectContaining({ ruleId: 'CLDBRN-AWS-TAGGING-1', status: 'passed' }),
    ]);
    expectReadOnlyRequests();
  });

  it('keeps catalog access failures separate from unassessed Compute Optimizer enrollment', async () => {
    failOperation = 'ListResources';
    const result = await discoverRules(['CLDBRN-AWS-LAMBDA-4', 'CLDBRN-AWS-COSTEXPLORER-1']);

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'compute-optimizer-enrollment',
        datasetKeys: ['aws-lambda-memory-recommendations'],
        reasons: ['dataset-unavailable'],
        scope: { type: 'regional', regions: ['eu-west-1'] },
        status: 'unavailable',
      },
      {
        capability: 'cost-explorer-access',
        datasetKeys: ['aws-cost-usage'],
        reasons: [],
        scope: { type: 'account' },
        status: 'available',
      },
    ]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ service: 'resource-explorer', code: 'AccessDeniedException' }),
      ]),
    );
    expect(requests.some((request) => request.hostname.includes('compute-optimizer'))).toBe(false);
    expectReadOnlyRequests();
  });

  it('reports Compute Optimizer enrollment unavailable when the account has not opted in', async () => {
    useLambdaScenario(['eu-west-1']);
    optInOperation = 'GetLambdaFunctionRecommendations';
    const result = await discoverRules(['CLDBRN-AWS-LAMBDA-4']);

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'compute-optimizer-enrollment',
        datasetKeys: ['aws-lambda-memory-recommendations'],
        reasons: ['not-enrolled'],
        scope: { type: 'regional', regions: ['eu-west-1'] },
        status: 'unavailable',
      },
    ]);
    expect(result.evaluations?.rules).toEqual([
      expect.objectContaining({ ruleId: 'CLDBRN-AWS-LAMBDA-4', status: 'not_applicable' }),
    ]);
    expectReadOnlyRequests();
  });

  it('keeps Compute Optimizer partial and coverage unknown when one region fails', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    enabledRegions = ['eu-west-1', 'us-east-1'];
    aggregatorIndex = true;
    useLambdaScenario(['eu-west-1', 'us-east-1']);
    lambdaRecommendationsByRegion = {
      'eu-west-1': [
        {
          accountId: '111111111111',
          finding: 'NotOptimized',
          functionArn: 'arn:aws:lambda:eu-west-1:111111111111:function:fn-eu-west-1',
        },
      ],
    };
    transientOperation = 'GetLambdaFunctionRecommendations';
    transientHostname = 'compute-optimizer.us-east-1.amazonaws.com';
    const result = await discoverRules(['CLDBRN-AWS-LAMBDA-4'], {
      mode: 'regions',
      regions: ['eu-west-1', 'us-east-1'],
    });

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'compute-optimizer-enrollment',
        datasetKeys: ['aws-lambda-memory-recommendations'],
        reasons: ['incomplete-evidence', 'service-error'],
        scope: { type: 'regional', regions: ['eu-west-1', 'us-east-1'] },
        status: 'partial',
      },
    ]);
    expect(result.evaluations?.rules).toEqual([
      expect.objectContaining({ ruleId: 'CLDBRN-AWS-LAMBDA-4', status: 'unknown' }),
    ]);
    expect(
      requests.filter(
        (request) =>
          request.operation === 'GetLambdaFunctionRecommendations' &&
          request.hostname === 'compute-optimizer.us-east-1.amazonaws.com',
      ),
    ).toHaveLength(6);
    expectReadOnlyRequests();
  });

  it.each<{ scope: AwsCapabilityScope; target: AwsDiscoveryTarget }>([
    {
      scope: { regions: ['eu-west-1'], type: 'regional' },
      target: { mode: 'regions', regions: ['eu-west-1'] },
    },
    {
      scope: { type: 'all-regions' },
      target: { mode: 'all' },
    },
  ])('reports Compute Optimizer not-assessed when no Lambda catalog resources match', async ({ scope, target }) => {
    if (target.mode === 'all') {
      aggregatorIndex = true;
      enabledRegions = ['eu-west-1', 'us-east-1'];
    }
    const result = await discoverRules(['CLDBRN-AWS-LAMBDA-4'], target);

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'compute-optimizer-enrollment',
        datasetKeys: ['aws-lambda-memory-recommendations'],
        reasons: ['not-assessed'],
        scope,
        status: 'unavailable',
      },
    ]);
    expect(requests.filter((request) => request.operation === 'GetLambdaFunctionRecommendations')).toEqual([]);
    expect(result.evaluations?.rules).toEqual([
      expect.objectContaining({ ruleId: 'CLDBRN-AWS-LAMBDA-4', status: 'passed' }),
    ]);
    expectReadOnlyRequests();
  });

  it('limits all-region Compute Optimizer readiness to observed regions', async () => {
    enabledRegions = ['eu-west-1', 'us-east-1'];
    aggregatorIndex = true;
    useLambdaScenario(['eu-west-1']);
    lambdaRecommendationsByRegion = {
      'eu-west-1': [
        {
          accountId: '111111111111',
          finding: 'NotOptimized',
          functionArn: 'arn:aws:lambda:eu-west-1:111111111111:function:fn-eu-west-1',
        },
      ],
    };
    const result = await discoverRules(['CLDBRN-AWS-LAMBDA-4'], { mode: 'all' });

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'compute-optimizer-enrollment',
        datasetKeys: ['aws-lambda-memory-recommendations'],
        reasons: [],
        scope: { regions: ['eu-west-1'], type: 'regional' },
        status: 'available',
      },
    ]);
    expectReadOnlyRequests();
  });

  it('keeps Compute Optimizer partial when an empty response leaves observed functions unknown', async () => {
    useLambdaScenario(['eu-west-1']);
    const result = await discoverRules(['CLDBRN-AWS-LAMBDA-4']);

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'compute-optimizer-enrollment',
        datasetKeys: ['aws-lambda-memory-recommendations'],
        reasons: ['incomplete-evidence'],
        scope: { type: 'regional', regions: ['eu-west-1'] },
        status: 'partial',
      },
    ]);
    expect(result.evaluations?.rules).toEqual([
      expect.objectContaining({ ruleId: 'CLDBRN-AWS-LAMBDA-4', status: 'unknown' }),
    ]);
    expectReadOnlyRequests();
  });

  it('scopes Compute Optimizer to observed regions only when other selected regions have no matches', async () => {
    enabledRegions = ['eu-west-1', 'us-east-1'];
    aggregatorIndex = true;
    useLambdaScenario(['eu-west-1']);
    lambdaRecommendationsByRegion = {
      'eu-west-1': [
        {
          accountId: '111111111111',
          finding: 'NotOptimized',
          functionArn: 'arn:aws:lambda:eu-west-1:111111111111:function:fn-eu-west-1',
        },
      ],
    };
    const result = await discoverRules(['CLDBRN-AWS-LAMBDA-4'], {
      mode: 'regions',
      regions: ['eu-west-1', 'us-east-1'],
    });

    expect(capabilitiesOf(result)).toEqual([
      {
        capability: 'compute-optimizer-enrollment',
        datasetKeys: ['aws-lambda-memory-recommendations'],
        reasons: [],
        scope: { type: 'regional', regions: ['eu-west-1'] },
        status: 'available',
      },
    ]);
    expect(requests.filter((request) => request.hostname === 'compute-optimizer.us-east-1.amazonaws.com')).toEqual([]);
    expectReadOnlyRequests();
  });

  it.each<{
    body?: unknown;
    dataUnavailable?: boolean;
    expected: { reasons: AwsCapabilityReason[]; status: AwsCapabilityStatus };
    ruleStatus: 'passed' | 'not_applicable';
  }>([
    {
      expected: { reasons: [], status: 'available' },
      ruleStatus: 'passed',
    },
    {
      body: { SavingsPlansCoverages: [{}] },
      expected: { reasons: ['incomplete-evidence'], status: 'unavailable' },
      ruleStatus: 'not_applicable',
    },
    {
      dataUnavailable: true,
      expected: { reasons: ['data-unavailable'], status: 'unavailable' },
      ruleStatus: 'not_applicable',
    },
  ])(
    'projects SageMaker coverage evidence onto Cost Explorer access',
    async ({ body, dataUnavailable, expected, ruleStatus }) => {
      if (body !== undefined) savingsPlansCoverageResponse = body;
      if (dataUnavailable) savingsPlansDataUnavailable = true;
      const result = await discoverRules(['CLDBRN-AWS-SAGEMAKER-3']);

      expect(capabilitiesOf(result)).toEqual([
        {
          capability: 'cost-explorer-access',
          datasetKeys: ['aws-sagemaker-savings-plans-coverage'],
          reasons: expected.reasons,
          scope: { type: 'account' },
          status: expected.status,
        },
      ]);
      expect(result.evaluations?.rules).toEqual([
        expect.objectContaining({ ruleId: 'CLDBRN-AWS-SAGEMAKER-3', status: ruleStatus }),
      ]);
      expectReadOnlyRequests();
    },
  );
});
