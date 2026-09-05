import { readFileSync } from 'node:fs';
import { EC2Client } from '@aws-sdk/client-ec2';
import type { HttpRequest } from '@aws-sdk/types';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CloudBurnClient } from '../src/index.js';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/aws-discovery/${name}`, import.meta.url), 'utf8');
const jsonResponse = (name: string) => ({
  response: { statusCode: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from(fixture(name)) },
});
let denyVolumes: boolean;
let requests: Array<{ hostname: string; operation: string }>;
let unexpected: string[];

beforeEach(() => {
  denyVolumes = false;
  requests = [];
  unexpected = [];
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
    const operation = request.path === '/' ? (new URLSearchParams(body).get('Action') ?? '') : request.path.slice(1);
    requests.push({ hostname: request.hostname, operation });
    if (request.hostname === 'resource-explorer-2.eu-west-1.amazonaws.com') {
      if (operation === 'ListIndexes') return jsonResponse('indexes.json');
      if (operation === 'GetDefaultView') return jsonResponse('default-view.json');
      if (operation === 'GetView') return jsonResponse('view.json');
      if (operation === 'ListResources') {
        const input = body ? JSON.parse(body) : request.query;
        return jsonResponse(input.NextToken ? 'resources-last.json' : 'resources-first.json');
      }
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
    const description = `${request.method} ${request.hostname}${request.path}`;
    unexpected.push(description);
    throw new Error(`Unexpected offline AWS request: ${description}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  expect(unexpected).toEqual([]);
});

const discover = () =>
  new CloudBurnClient().discover({
    target: { mode: 'regions', regions: ['eu-west-1'] },
    config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1'] } },
    aws: { credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-test-key' } },
    includeEvaluationResources: true,
  });

it('discovers through real AWS serialization, catalog pagination, hydration and rule evaluation', async () => {
  const result = await discover();
  expect(result.providers[0]?.rules[0]?.findings).toEqual([
    { accountId: '111111111111', region: 'eu-west-1', resourceId: 'vol-legacy', resourceType: 'ec2:volume' },
  ]);
  expect(result.evaluations?.resourceSets[0]?.resources.map((resource) => resource.resourceId).sort()).toEqual([
    'vol-current',
    'vol-legacy',
  ]);
  expect(result.diagnostics).toBeUndefined();
  expect(requests.filter((request) => request.operation === 'ListResources')).toHaveLength(2);
  expect(requests.filter((request) => request.operation === 'DescribeVolumes')).toHaveLength(1);
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
