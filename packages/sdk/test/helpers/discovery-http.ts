import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EC2Client } from '@aws-sdk/client-ec2';
import type { HttpHandlerOptions, HttpRequest } from '@aws-sdk/types';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { type AwsDiscoveryTarget, CloudBurnClient } from '../../src/index.js';
import { decodeRequestBody } from './http.js';

// Offline AWS transport shared by the discovery HTTP integration suites. Tests stay in separate files so Vitest can run
// these timer-paced suites in parallel workers.

/** Options accepted by {@link CloudBurnClient.discover}, reused so test fixtures stay in sync with the public contract. */
type DiscoverOptions = NonNullable<Parameters<CloudBurnClient['discover']>[0]>;
/** Reusable-evidence fixtures always set a regional target and a directory-backed cache. */
export type RegionsCacheDiscoverOptions = DiscoverOptions & {
  target: Extract<NonNullable<DiscoverOptions['target']>, { mode: 'regions' }>;
  cache: NonNullable<DiscoverOptions['cache']> & { directory: string };
};

const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/aws-discovery/${name}`, import.meta.url), 'utf8');
const jsonResponse = (body: unknown) => ({
  response: {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify(body)),
  },
});
const jsonFixture = (name: string) => jsonResponse(JSON.parse(fixture(name)));
/** Synthetic account that owns discovered resources. */
export const accountId = '111111111111';
/** Synthetic region used by single-region scans. */
export const region = 'eu-west-1';
const prefix = (name: string) => (name.startsWith('net') ? 'net' : name.startsWith('gwy') ? 'gwy' : 'app');
const loadBalancerArn = (name: string, type = prefix(name)) =>
  `arn:aws:elasticloadbalancing:${region}:${accountId}:loadbalancer/${type}/${name}/123`;
const targetGroupArn = (name: string) => `arn:aws:elasticloadbalancing:${region}:${accountId}:targetgroup/${name}/123`;
/** Builds the resource identity of a synthetic load balancer. */
export const identity = (name: string, type = prefix(name)) => ({
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
/** Serves the named load balancers from the catalog and Elastic Load Balancing APIs. */
export const useElbScenario = (names = Array.from({ length: 10 }, (_, index) => `alb-${index}`)): ElbScenario => {
  // Freeze the observation date while allowing admission waits to refill quota tokens.
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-09-07T12:00:00.000Z'));
  elbScenario = { names, includeTargets: false, metricCases: {} };
  return elbScenario;
};

/** Per-test AWS responses that tests adjust before discovery; {@link useDiscoveryHttpHarness} resets them. */
export const scenario = {} as {
  denyVolumes: boolean;
  denyIdentity: boolean;
  includeNewVolume: boolean;
  viewScope: string | undefined;
  enabledRegions: string[] | undefined;
  holdOperation: string | undefined;
  holdLastCatalogPage: boolean;
  failOperation: string | undefined;
  transientOperation: string | undefined;
  transientHostname: string | undefined;
  transientStatusCode: number;
  transientFailures: number;
  aggregatorIndex: boolean;
  denyHubActionType: string | undefined;
  hubEnrollmentStatus: 'Active' | 'Inactive';
  optInOperation: string | undefined;
  lambdaCatalogResources: unknown[];
  lambdaFunctionsByRegion: Record<string, unknown[]>;
  lambdaRecommendationsByRegion: Record<string, unknown[]>;
  untaggedResources: unknown[];
  taggingMetadataResponses: Record<
    string,
    string | object | ((input: Record<string, string>) => ReturnType<typeof jsonResponse>)
  >;
  savingsPlansCoverageResponse: unknown;
  savingsPlansDataUnavailable: boolean;
  savingsPlansSageMakerUnused: boolean;
};
/** Authorization headers of every signed request in the current test. */
export let authorizations: string[];
/** Hostname and operation of every AWS request in the current test. */
export let requests: Array<{ hostname: string; operation: string }>;
/** CloudWatch `GetMetricData` windows and datapoint counts served in the current test. */
export let metricRequests: Array<{ start: number; end: number; queryCount: number; datapoints: number }>;
/** Requests the offline transport could not answer; the shared `afterEach` requires it to stay empty. */
let unexpected: string[];
/** SDK debug log lines captured by {@link discover} and other test clients. */
export let debugMessages: string[];
/** Private AWS admission directory created for the current test. */
export let admissionDirectory: string;
/** Requests paused by `scenario.holdOperation`, released or aborted by the test. */
export let held: Array<{ region: string; signal: AbortSignal; release: () => void }>;

/** Registers the offline AWS transport, environment, and admission directory for every test in the file. */
export const useDiscoveryHttpHarness = (): void => {
  beforeEach(() => {
    elbScenario = undefined;
    authorizations = [];
    scenario.enabledRegions = undefined;
    scenario.holdOperation = undefined;
    scenario.holdLastCatalogPage = false;
    scenario.failOperation = undefined;
    scenario.transientOperation = undefined;
    scenario.transientHostname = undefined;
    scenario.transientStatusCode = 500;
    scenario.transientFailures = Number.POSITIVE_INFINITY;
    held = [];
    scenario.aggregatorIndex = false;
    scenario.denyHubActionType = undefined;
    scenario.hubEnrollmentStatus = 'Active';
    scenario.optInOperation = undefined;
    scenario.lambdaCatalogResources = [];
    scenario.lambdaFunctionsByRegion = {};
    scenario.lambdaRecommendationsByRegion = {};
    scenario.untaggedResources = [];
    scenario.taggingMetadataResponses = {};
    scenario.savingsPlansCoverageResponse = { SavingsPlansCoverages: [] };
    scenario.savingsPlansDataUnavailable = false;
    scenario.savingsPlansSageMakerUnused = false;
    scenario.denyVolumes = false;
    scenario.denyIdentity = false;
    scenario.includeNewVolume = false;
    scenario.viewScope = undefined;
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
        operation === scenario.transientOperation &&
        (!scenario.transientHostname || request.hostname === scenario.transientHostname) &&
        scenario.transientFailures-- > 0
      ) {
        const errorType = scenario.transientStatusCode === 429 ? 'ThrottlingException' : 'InternalServerException';
        return {
          response: {
            statusCode: scenario.transientStatusCode,
            headers: { 'content-type': 'application/json', 'x-amzn-errortype': errorType },
            body: Buffer.from(JSON.stringify({ message: 'Synthetic retryable failure' })),
          },
        };
      }
      if (operation === scenario.optInOperation) {
        return {
          response: {
            statusCode: 400,
            headers: { 'content-type': 'application/json', 'x-amzn-errortype': 'OptInRequiredException' },
            body: Buffer.from('{"message":"Synthetic opt-in required"}'),
          },
        };
      }
      if (operation === scenario.failOperation) {
        return {
          response: {
            statusCode: 403,
            headers: { 'content-type': 'application/json', 'x-amzn-errortype': 'AccessDeniedException' },
            body: Buffer.from('{"message":"Synthetic denial"}'),
          },
        };
      }
      const metadataInput = body.startsWith('{') ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body));
      const nextMetadataToken = metadataInput.NextToken ?? metadataInput.AssociationId;
      const taggingMetadata =
        scenario.taggingMetadataResponses[`${operation}:${nextMetadataToken ?? ''}`] ??
        scenario.taggingMetadataResponses[operation];
      if (taggingMetadata !== undefined) {
        if (typeof taggingMetadata === 'function') return taggingMetadata(metadataInput);
        if (typeof taggingMetadata !== 'string') return jsonResponse(taggingMetadata);
        return {
          response: {
            statusCode: 200,
            headers: { 'content-type': 'text/xml' },
            body: Buffer.from(
              `<${operation}Response xmlns="http://ec2.amazonaws.com/doc/2016-11-15/">${taggingMetadata}</${operation}Response>`,
            ),
          },
        };
      }
      if (operation === scenario.holdOperation && (!scenario.holdLastCatalogPage || JSON.parse(body).NextToken)) {
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
          return jsonResponse({ items: [{ accountId: '222222222222', status: scenario.hubEnrollmentStatus }] });
        }
        if (operation === 'ListRecommendations') {
          const input = body ? JSON.parse(body) : {};
          const actionTypes = (input.filter?.actionTypes ?? []) as string[];
          if (scenario.denyHubActionType && actionTypes.includes(scenario.denyHubActionType)) {
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
        // Like AWS, a query filtered to a service without eligible usage has no data even though Cost Explorer works.
        if (
          scenario.savingsPlansDataUnavailable ||
          (scenario.savingsPlansSageMakerUnused && body && JSON.parse(body).Filter)
        ) {
          return {
            response: {
              statusCode: 400,
              headers: { 'content-type': 'application/json', 'x-amzn-errortype': 'DataUnavailableException' },
              body: Buffer.from('{"message":"Synthetic data unavailable"}'),
            },
          };
        }
        return jsonResponse(
          scenario.savingsPlansSageMakerUnused
            ? {
                SavingsPlansCoverages: [
                  {
                    Attributes: { SERVICE: 'AWS Lambda' },
                    Coverage: {
                      CoveragePercentage: '0',
                      OnDemandCost: '0.01',
                      SpendCoveredBySavingsPlans: '0',
                      TotalCost: '0.01',
                    },
                    TimePeriod: { End: '2026-09-29', Start: '2026-08-31' },
                  },
                ],
              }
            : scenario.savingsPlansCoverageResponse,
        );
      }
      if (
        request.hostname.startsWith('lambda.') &&
        request.method === 'GET' &&
        ['/2015-03-31/functions', '/2015-03-31/functions/'].includes(request.path)
      ) {
        const hostRegion = request.hostname.split('.')[1] ?? '';
        return jsonResponse({ Functions: scenario.lambdaFunctionsByRegion[hostRegion] ?? [] });
      }
      if (request.hostname.startsWith('compute-optimizer.') && operation === 'GetLambdaFunctionRecommendations') {
        const hostRegion = request.hostname.split('.')[1] ?? '';
        return jsonResponse({
          lambdaFunctionRecommendations: scenario.lambdaRecommendationsByRegion[hostRegion] ?? [],
        });
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
              ...(scenario.aggregatorIndex
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
          if (scenario.viewScope) value.View.Scope = scenario.viewScope;
          return jsonResponse(value);
        }
        if (operation === 'ListResources') {
          const filterInput = body ? JSON.parse(body) : request.query;
          const filterString = filterInput.Filters?.FilterString ?? '';
          if (filterString.includes('tag:none')) return jsonResponse({ Resources: scenario.untaggedResources });
          if (filterString.includes('lambda:function'))
            return jsonResponse({ Resources: scenario.lambdaCatalogResources });
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
          if (scenario.holdLastCatalogPage && !input.NextToken) value.Resources = [];
          if (scenario.includeNewVolume && input.NextToken)
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
            statusCode: scenario.denyIdentity ? 403 : 200,
            headers: { 'content-type': 'text/xml' },
            body: Buffer.from(
              scenario.denyIdentity
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
              scenario.enabledRegions
                ? `<DescribeRegionsResponse><regionInfo>${scenario.enabledRegions.map((region) => `<item><regionName>${region}</regionName></item>`).join('')}</regionInfo></DescribeRegionsResponse>`
                : fixture('regions.xml'),
            ),
          },
        };
      }
      if (request.hostname === 'ec2.eu-west-1.amazonaws.com' && operation === 'DescribeVolumes') {
        return {
          response: {
            statusCode: scenario.denyVolumes ? 403 : 200,
            headers: { 'content-type': 'text/xml' },
            body: Buffer.from(
              scenario.denyVolumes
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
};

/** Runs a single-region discovery for one rule with synthetic credentials. */
export const discover = (ruleId = 'CLDBRN-AWS-EBS-1') =>
  new CloudBurnClient({ debugLogger: (message) => debugMessages.push(message) }).discover({
    target: { mode: 'regions', regions: ['eu-west-1'] },
    config: { discovery: { enabledRules: [ruleId] } },
    aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
    includeEvaluationResources: true,
  });

/** Returns the logged `DescribeVolumes` admission attempt. */
export const volumeAttempt = () =>
  debugMessages
    .filter((message) => message.startsWith('aws: attempt '))
    .map((message) => JSON.parse(message.slice(13)))
    .find((attempt) => attempt.operation === 'DescribeVolumes');

/**
 * Settles discovery started under fake timers, skipping its admission waits and retry backoff.
 *
 * @param pending - Discovery started after `vi.useFakeTimers()`.
 * @param operation - The AWS operation whose first request precedes the backoff.
 * @returns The settled discovery result.
 */
export const settleOnFakeTimers = async <T>(pending: Promise<T>, operation: string): Promise<T> => {
  // Each waitFor check also advances fake timers, moving the admission waits that precede the request.
  await vi.waitFor(() => expect(requests.some((request) => request.operation === operation)).toBe(true), {
    timeout: 10_000,
  });
  await vi.advanceTimersByTimeAsync(120_000);
  return pending;
};

// Public cancellation rejects promptly; let the detached request release its
// SQLite lease before this fixture deletes its private admission directory.
/** Waits until a cancelled catalog request releases its admission lease. */
export const waitForCancelledCatalogCleanup = async () => {
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
/** Asserts that discovery sent no mutating request. */
export const expectReadOnlyRequests = () =>
  expect(requests.filter((request) => WRITE_OPERATIONS.includes(request.operation))).toEqual([]);

/** Runs discovery for the given rules with synthetic credentials. */
export const discoverRules = (
  ruleIds: string[],
  target: AwsDiscoveryTarget = { mode: 'regions', regions: ['eu-west-1'] },
  options?: Pick<DiscoverOptions, 'signal'>,
) =>
  new CloudBurnClient({ debugLogger: (message) => debugMessages.push(message) }).discover({
    ...(options?.signal ? { signal: options.signal } : {}),
    target,
    config: { discovery: { enabledRules: ruleIds } },
    aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
    includeEvaluationResources: true,
  });

/** Returns the capability outcomes of a discovery result. */
export const capabilitiesOf = (result: Awaited<ReturnType<typeof discoverRules>>) => result.capabilities ?? [];

/** Serves one Lambda function per region from the catalog and Lambda APIs. */
export const useLambdaScenario = (regions: string[]) => {
  scenario.lambdaCatalogResources = regions.map((region) => ({
    Arn: `arn:aws:lambda:${region}:111111111111:function:fn-${region}`,
    OwningAccountId: '111111111111',
    Region: region,
    ResourceType: 'lambda:function',
    Service: 'lambda',
  }));
  scenario.lambdaFunctionsByRegion = Object.fromEntries(
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
