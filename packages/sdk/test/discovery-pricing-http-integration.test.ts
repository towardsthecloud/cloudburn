import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EC2Client } from '@aws-sdk/client-ec2';
import type { HttpRequest } from '@aws-sdk/types';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CloudBurnClient } from '../src/index.js';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/aws-discovery/${name}`, import.meta.url), 'utf8');
const response = (body: string, contentType = 'application/json') => ({
  response: { statusCode: 200, headers: { 'content-type': contentType }, body: Buffer.from(body) },
});
let admissionDirectory: string;
let unexpected: string[];
let debugMessages: string[];

beforeEach(() => {
  unexpected = [];
  debugMessages = [];
  admissionDirectory = mkdtempSync(join(tmpdir(), 'cloudburn-pricing-http-'));
  vi.stubEnv('CLOUDBURN_AWS_ADMISSION_DIR', admissionDirectory);
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
      if (operation === 'ListIndexes') return response(fixture('indexes.json'));
      if (operation === 'GetDefaultView') return response(fixture('default-view.json'));
      if (operation === 'GetView') return response(fixture('view.json'));
      if (operation === 'ListResources') {
        return response(
          JSON.stringify({
            Resources: [
              {
                Arn: 'arn:aws:ec2:eu-west-1:111111111111:transit-gateway-attachment/tgw-attach-synthetic',
                OwningAccountId: '111111111111',
                Region: 'eu-west-1',
                ResourceType: 'ec2:transit-gateway-attachment',
                Service: 'ec2',
              },
            ],
          }),
        );
      }
    }
    if (request.hostname === 'sts.eu-west-1.amazonaws.com' && operation === 'GetCallerIdentity') {
      return response(fixture('caller-identity.xml'), 'text/xml');
    }
    if (request.hostname === 'ec2.eu-west-1.amazonaws.com') {
      if (operation === 'DescribeRegions') return response(fixture('regions.xml'), 'text/xml');
      if (operation === 'DescribeTransitGatewayAttachments') {
        return response(
          '<DescribeTransitGatewayAttachmentsResponse><transitGatewayAttachments><item><transitGatewayAttachmentId>tgw-attach-synthetic</transitGatewayAttachmentId><resourceType>vpc</resourceType></item></transitGatewayAttachments></DescribeTransitGatewayAttachmentsResponse>',
          'text/xml',
        );
      }
      if (operation === 'DescribeTransitGatewayVpcAttachments') {
        return response(
          '<DescribeTransitGatewayVpcAttachmentsResponse><transitGatewayVpcAttachments><item><transitGatewayAttachmentId>tgw-attach-synthetic</transitGatewayAttachmentId><transitGatewayId>tgw-synthetic</transitGatewayId><vpcId>vpc-synthetic</vpcId><state>available</state><creationTime>2020-01-01T00:00:00Z</creationTime></item></transitGatewayVpcAttachments></DescribeTransitGatewayVpcAttachmentsResponse>',
          'text/xml',
        );
      }
    }
    if (request.hostname === 'monitoring.eu-west-1.amazonaws.com' && operation === 'GetMetricData') {
      const input = JSON.parse(body);
      const startTime = input.StartTime;
      return response(
        JSON.stringify({
          MetricDataResults: input.MetricDataQueries.map((query: { Id: string }) => ({
            Id: query.Id,
            StatusCode: 'Complete',
            Timestamps: Array.from({ length: 30 }, (_, index) => startTime + index * 86_400),
            Values: Array.from({ length: 30 }, () => 0),
          })),
        }),
      );
    }
    const description = `${request.method} ${request.hostname}${request.path}`;
    unexpected.push(description);
    throw new Error(`Unexpected offline AWS request: ${description}`);
  });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Synthetic pricing unavailable')));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(admissionDirectory, { recursive: true, force: true });
  expect(unexpected).toEqual([]);
});

const discover = (signal?: AbortSignal) =>
  new CloudBurnClient({ debugLogger: (message) => debugMessages.push(message) }).discover({
    target: { mode: 'regions', regions: ['eu-west-1'] },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EC2-14'] } },
    aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
    includeEvaluationResources: true,
    signal,
  });

it('aborts active public pricing transport when the caller cancels discovery', async () => {
  const controller = new AbortController();
  const started = Promise.withResolvers<AbortSignal>();
  vi.mocked(fetch).mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        const signal = options?.signal as AbortSignal;
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        started.resolve(signal);
      }),
  );
  const work = discover(controller.signal);
  const rejected = expect(work).rejects.toThrow('Synthetic caller cancellation');
  const pricingSignal = await started.promise;
  controller.abort(new Error('Synthetic caller cancellation'));
  await rejected;
  expect(pricingSignal.aborted).toBe(true);
});

it('retains activity findings and reports a failed public price lookup without an AWS account quota', async () => {
  const result = await discover();
  expect(result.providers[0]?.rules[0]?.findings).toEqual([
    { accountId: '111111111111', region: 'eu-west-1', resourceId: 'tgw-attach-synthetic' },
  ]);
  expect(result.evaluations?.resourceSets[0]?.resources[0]?.data).toMatchObject({
    hourlyAttachmentCostUsd: null,
    estimatedMonthlyAttachmentCostUsd: null,
  });
  const priceAttempt = debugMessages
    .filter((message) => message.startsWith('aws: attempt '))
    .map((message) => JSON.parse(message.slice(13)))
    .find((attempt) => attempt.operation === 'GetPublicPriceList');
  expect(priceAttempt).toMatchObject({
    service: 'AWS Public Pricing',
    region: 'eu-west-1',
    outcome: 'unavailable',
    durationMs: expect.any(Number),
  });
  expect(priceAttempt).not.toHaveProperty('quota');
  expect(debugMessages.join('\n')).not.toContain('synthetic-test-key');
});

it('keeps activity evaluation available when only the public pricing deadline expires', async () => {
  const timeout = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
  const started = Promise.withResolvers<void>();
  vi.mocked(fetch).mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        const signal = options?.signal as AbortSignal;
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        started.resolve();
      }),
  );
  const work = discover();
  await started.promise;
  timeout.abort(new DOMException('Synthetic pricing deadline', 'TimeoutError'));
  const result = await work;
  expect(result.providers[0]?.rules[0]?.findings).toEqual([
    { accountId: '111111111111', region: 'eu-west-1', resourceId: 'tgw-attach-synthetic' },
  ]);
  expect(result.evaluations?.resourceSets[0]?.resources[0]?.data).toMatchObject({ hourlyAttachmentCostUsd: null });
});
