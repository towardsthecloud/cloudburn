import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import type { HttpRequest } from '@aws-sdk/types';
import { awsRules, LiveResourceBag } from '@cloudburn/rules';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { withAwsClientCredentials } from '../../src/providers/aws/client.js';
import { withAwsDiscoveryExecution } from '../../src/providers/aws/execution.js';
import {
  hydrateAwsCloudFrontDistributionRequestActivity,
  hydrateAwsCloudFrontDistributions,
} from '../../src/providers/aws/resources/cloudfront.js';

const accountId = '123456789012';
const arn = (id: string) => `arn:aws:cloudfront::${accountId}:distribution/${id}`;
const xml = (body: string, statusCode = 200) => ({
  response: { statusCode, headers: { 'content-type': 'text/xml' }, body: Buffer.from(body) },
});
const summary = (id: string, fields = '<PriceClass>PriceClass_All</PriceClass>') =>
  `<DistributionSummary><Id>${id}</Id><ARN>${arn(id)}</ARN>${fields}</DistributionSummary>`;
const page = (items: string, nextMarker = '') =>
  xml(`<DistributionList><Items>${items}</Items><NextMarker>${nextMarker}</NextMarker></DistributionList>`);
let requests: HttpRequest[];
let respond: (request: HttpRequest) => ReturnType<typeof xml> | Promise<ReturnType<typeof xml>>;
let unexpected: string[];

beforeEach(() => {
  requests = [];
  unexpected = [];
  vi.stubEnv('AWS_CONFIG_FILE', '/dev/null');
  vi.stubEnv('AWS_SHARED_CREDENTIALS_FILE', '/dev/null');
  const probe = new CloudFrontClient({ region: 'us-east-1' });
  const transport: typeof probe.config.requestHandler = Object.getPrototypeOf(probe.config.requestHandler);
  probe.destroy();
  vi.spyOn(transport, 'handle').mockImplementation(async (request: HttpRequest) => {
    requests.push(request);
    if (['cloudfront.amazonaws.com', 'monitoring.us-east-1.amazonaws.com'].includes(request.hostname)) {
      return respond(request);
    }
    unexpected.push(`${request.hostname}${request.path}`);
    throw new Error('Unexpected offline AWS request');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  expect(unexpected).toEqual([]);
});

it.each(['failure', 'cancellation'] as const)('stops queued detail requests after %s', async (outcome) => {
  const gate = Promise.withResolvers<void>();
  const first = Promise.withResolvers<void>();
  const controller = new AbortController();
  respond = async (request) => {
    await (request.path.endsWith('/E000') ? first.promise : gate.promise);
    return request.path.endsWith('/E000')
      ? xml(
          '<ErrorResponse><Error><Code>AccessDenied</Code><Message>Synthetic denial</Message></Error></ErrorResponse>',
          403,
        )
      : detail();
  };
  const work = run(
    () =>
      hydrateAwsCloudFrontDistributions(
        Array.from({ length: 100 }, (_, index) => catalogResource(`E${String(index).padStart(3, '0')}`)),
      ),
    controller.signal,
  );
  const assertion =
    outcome === 'cancellation'
      ? expect(work).rejects.toMatchObject({ name: 'AbortError' })
      : expect(work).rejects.toThrow(/GetDistribution/);
  try {
    await vi.waitFor(() => expect(requests).toHaveLength(10));
    if (outcome === 'cancellation') controller.abort();
    else first.resolve();
    await assertion;
  } finally {
    first.resolve();
    gate.resolve();
    await work.catch(() => undefined);
  }
  // Let the active transports settle so abandoned work would be observable.
  await new Promise((resolve) => setImmediate(resolve));
  expect(requests).toHaveLength(10);
});

it('retries a throttled list page without introducing detail requests', async () => {
  vi.useFakeTimers();
  respond = () =>
    requests.length === 1
      ? xml(
          '<ErrorResponse><Error><Code>Throttling</Code><Message>Synthetic throttle</Message></Error></ErrorResponse>',
          429,
        )
      : page(summary('EALL'));
  const work = run(hydrate);
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  await vi.advanceTimersByTimeAsync(1000);
  expect(await work).toMatchObject([{ distributionId: 'EALL', priceClass: 'PriceClass_All' }]);
  expect(requests).toHaveLength(2);
  expect(details()).toHaveLength(0);
});

it.each([
  'Complete',
  'Complete-empty',
  'PartialData',
  'Forbidden',
  'Missing',
])('preserves %s request evidence through the real CloudWatch helper', async (status) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));
  respond = (request) => {
    if (request.hostname === 'cloudfront.amazonaws.com') return page(summary('EALL'));
    const input = JSON.parse(String(request.body));
    expect(input.MetricDataQueries[0].MetricStat.Metric.Dimensions).toEqual([
      { Name: 'DistributionId', Value: 'EALL' },
      { Name: 'Region', Value: 'Global' },
    ]);
    const empty = status === 'Complete-empty';
    return {
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(
          JSON.stringify({
            MetricDataResults:
              status === 'Missing'
                ? []
                : [
                    {
                      Id: 'distribution0',
                      StatusCode: empty ? 'Complete' : status,
                      Timestamps: empty
                        ? []
                        : Array.from({ length: 30 }, (_, index) => Date.UTC(2026, 7, 8 + index) / 1000),
                      Values: empty ? [] : Array.from({ length: 30 }, () => 3),
                    },
                  ],
          }),
        ),
      },
    };
  };
  const result = await run(async () => {
    const distributions = await hydrate();
    return hydrateAwsCloudFrontDistributionRequestActivity([], {
      loadDataset: async () => distributions,
    } as Parameters<typeof hydrateAwsCloudFrontDistributionRequestActivity>[1]);
  });
  expect(result).toEqual([
    {
      accountId,
      distributionArn: arn('EALL'),
      distributionId: 'EALL',
      region: 'global',
      totalRequestsLast30Days: status === 'Complete' ? 90 : null,
    },
  ]);
  expect(requests.filter((request) => request.hostname === 'cloudfront.amazonaws.com')).toHaveLength(1);
});

const run = <T>(load: () => Promise<T>, signal?: AbortSignal) =>
  withAwsClientCredentials({ accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' }, () =>
    withAwsDiscoveryExecution({ signal }, load),
  );
const hydrate = () => hydrateAwsCloudFrontDistributions([], { resolveAccountId: async () => accountId });
const details = () => requests.filter((request) => request.path !== '/2020-05-31/distribution');
const catalogResource = (id: string) => ({
  accountId,
  arn: arn(id),
  properties: [],
  region: 'global',
  resourceType: 'cloudfront:distribution',
  service: 'cloudfront',
});
const detail = () =>
  xml(
    '<Distribution><LastModifiedTime>2026-09-03T12:00:00Z</LastModifiedTime><DistributionConfig><PriceClass>PriceClass_100</PriceClass></DistributionConfig></Distribution>',
  );

it('hydrates 100 fallback distributions with one list request and no detail requests', async () => {
  const ids = Array.from({ length: 100 }, (_, index) => `E${String(index).padStart(3, '0')}`);
  respond = (request) =>
    request.path === '/2020-05-31/distribution'
      ? page(ids.map((id) => summary(id)).join(''))
      : xml(
          '<Distribution><DistributionConfig><PriceClass>PriceClass_All</PriceClass></DistributionConfig></Distribution>',
        );

  const result = await run(hydrate);

  expect(result).toHaveLength(100);
  expect(result[0]).toEqual({
    accountId,
    distributionArn: arn('E000'),
    distributionId: 'E000',
    priceClass: 'PriceClass_All',
    region: 'global',
  });
  expect(details()).toHaveLength(0);
  expect(requests).toHaveLength(1);
});

it.each(['catalog', 'fallback'])('excludes unsupported tenant-only price classes from %s findings', async (source) => {
  const fields = new Map([
    ['EALL', '<ConnectionMode>direct</ConnectionMode><PriceClass>PriceClass_All</PriceClass>'],
    ['ETENANTALL', '<ConnectionMode>tenant-only</ConnectionMode><PriceClass>PriceClass_All</PriceClass>'],
    ['ETENANTNONE', '<ConnectionMode>tenant-only</ConnectionMode><PriceClass>None</PriceClass>'],
  ]);
  respond = (request) => {
    if (request.path === '/2020-05-31/distribution') {
      return page([...fields].map(([id, config]) => summary(id, config)).join(''));
    }
    const config = fields.get(request.path.split('/').at(-1) ?? '');
    if (!config) throw new Error('Unexpected distribution detail request');
    return xml(`<Distribution><DistributionConfig>${config}</DistributionConfig></Distribution>`);
  };

  const distributions = await run(() =>
    source === 'catalog' ? hydrateAwsCloudFrontDistributions([...fields.keys()].map(catalogResource)) : hydrate(),
  );
  const finding = awsRules
    .find((rule) => rule.id === 'CLDBRN-AWS-CLOUDFRONT-1')
    ?.evaluateLive?.({
      catalog: { indexType: 'LOCAL', resources: [], searchRegion: 'us-east-1' },
      resources: new LiveResourceBag({ 'aws-cloudfront-distributions': distributions }),
    });

  expect(finding?.findings).toEqual([{ accountId, region: 'global', resourceId: arn('EALL') }]);
  expect(distributions.map((distribution) => distribution.priceClass)).toEqual([
    'PriceClass_All',
    undefined,
    undefined,
  ]);
  expect(requests).toHaveLength(source === 'catalog' ? 3 : 1);
  expect(details()).toHaveLength(source === 'catalog' ? 3 : 0);
});

it('uses ten continuous detail workers while preserving the exact catalog selection', async () => {
  const gates = Array.from({ length: 12 }, () => Promise.withResolvers<void>());
  const ids = Array.from({ length: 12 }, (_, index) => `E${String(index).padStart(3, '0')}`);
  respond = async (request) => {
    const index = ids.indexOf(request.path.split('/').at(-1) ?? '');
    if (index < 0) throw new Error('Unexpected catalog expansion');
    await gates[index]?.promise;
    return detail();
  };
  const resources = ids.map(catalogResource);
  const work = run(() =>
    hydrateAwsCloudFrontDistributions([...resources, catalogResource('E000')], {
      resolveAccountId: async () => {
        throw new Error('Catalog identity must be preserved');
      },
    }),
  );

  try {
    await vi.waitFor(() => expect(requests).toHaveLength(10));
    gates[1]?.resolve();
    await vi.waitFor(() => expect(requests).toHaveLength(11));
    gates[10]?.resolve();
    await vi.waitFor(() => expect(requests).toHaveLength(12));
  } finally {
    for (const gate of gates) gate.resolve();
    await work;
  }

  const result = await work;
  expect(result.map((distribution) => distribution.distributionArn)).toEqual(ids.map(arn));
  expect(result[0]).toEqual({
    accountId,
    distributionArn: arn('E000'),
    distributionId: 'E000',
    lastModifiedTime: '2026-09-03T12:00:00.000Z',
    priceClass: 'PriceClass_100',
    region: 'global',
  });
  expect(details()).toHaveLength(12);
});

it('retains paginated summary evidence and only fetches a missing standard price class', async () => {
  respond = (request) => {
    if (request.path === '/2020-05-31/distribution') {
      return request.query?.Marker
        ? page(
            summary('E200', '<PriceClass>PriceClass_200</PriceClass>') +
              summary('ENONE', '<PriceClass>None</PriceClass>') +
              summary('ETENANT', '<ConnectionMode>tenant-only</ConnectionMode>') +
              summary('EMISSING', '<LastModifiedTime>2026-09-01T12:00:00Z</LastModifiedTime>') +
              summary('EALL') +
              '<DistributionSummary><Id>NO-ARN</Id></DistributionSummary>',
          )
        : page(
            summary('EALL') +
              summary(
                'E100',
                '<PriceClass>PriceClass_100</PriceClass><LastModifiedTime>2026-09-02T12:00:00Z</LastModifiedTime>',
              ),
            'page-two',
          );
    }
    return xml(
      '<Distribution><DistributionConfig><PriceClass>PriceClass_100</PriceClass></DistributionConfig></Distribution>',
    );
  };

  const result = await run(hydrate);

  expect(result.map((distribution) => distribution.distributionId)).toEqual([
    'E100',
    'E200',
    'EALL',
    'EMISSING',
    'ENONE',
    'ETENANT',
  ]);
  expect(result.map((distribution) => distribution.priceClass)).toEqual([
    'PriceClass_100',
    'PriceClass_200',
    'PriceClass_All',
    'PriceClass_100',
    'None',
    undefined,
  ]);
  expect(result[0]).toMatchObject({ lastModifiedTime: '2026-09-02T12:00:00.000Z' });
  expect(result[3]).toMatchObject({ lastModifiedTime: '2026-09-01T12:00:00.000Z' });
  expect(details().map((request) => request.path)).toEqual(['/2020-05-31/distribution/EMISSING']);
  expect(requests).toHaveLength(3);
  expect(requests[1]?.query?.Marker).toBe('page-two');
});
