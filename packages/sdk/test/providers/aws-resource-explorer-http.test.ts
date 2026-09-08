import { ResourceExplorer2Client } from '@aws-sdk/client-resource-explorer-2';
import type { HttpRequest } from '@aws-sdk/types';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { withAwsClientCredentials } from '../../src/providers/aws/client.js';
import { withAwsDiscoveryExecution } from '../../src/providers/aws/execution.js';
import { type AwsRequestAttemptTelemetry, withAwsServiceCallBudget } from '../../src/providers/aws/request.js';
import { createMemoryAwsRequestStore } from '../../src/providers/aws/request-store.js';
import {
  createAwsResourceExplorerSetup,
  ensureAwsResourceExplorerDefaultViewIncludesTags,
  getAwsDiscoveryRegionStatus,
  listAwsDiscoveryIndexes,
  listAwsDiscoverySupportedResourceTypes,
  updateAwsResourceExplorerIndexType,
  waitForAwsResourceExplorerIndex,
  waitForAwsResourceExplorerSetup,
} from '../../src/providers/aws/resource-explorer.js';

const jsonResponse = (body: unknown, statusCode = 200) => ({
  response: { statusCode, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify(body)) },
});
let respond: (operation: string, input: Record<string, unknown>) => ReturnType<typeof jsonResponse>;
let unexpected: string[];

beforeEach(() => {
  unexpected = [];
  vi.stubEnv('AWS_REGION', 'eu-west-1');
  const probe = new ResourceExplorer2Client({ region: 'eu-west-1' });
  const transport: typeof probe.config.requestHandler = Object.getPrototypeOf(probe.config.requestHandler);
  probe.destroy();
  vi.spyOn(transport, 'handle').mockImplementation(async (request: HttpRequest) => {
    if (request.hostname !== 'resource-explorer-2.eu-west-1.amazonaws.com') {
      unexpected.push(request.hostname);
      throw new Error(`Unexpected AWS host: ${request.hostname}`);
    }
    return respond(request.path.slice(1), JSON.parse(String(request.body || '{}')));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  expect(unexpected).toEqual([]);
});

const run = <T>(execute: () => Promise<T>, events: AwsRequestAttemptTelemetry[]) =>
  withAwsClientCredentials({ accessKeyId: 'SYNTHETIC', secretAccessKey: 'SYNTHETIC' }, () =>
    withAwsDiscoveryExecution({}, () =>
      withAwsServiceCallBudget(execute, {
        accountId: '111111111111',
        overrides: { 'resource-explorer-2:non-search': { ratePerSecond: 100, burst: 100 } },
        store: createMemoryAwsRequestStore(),
        onAttempt: (event) => events.push(event),
      }),
    ),
  );

it('charges setup retries to the regional budget and preserves the setup request across physical attempts', async () => {
  const inputs: Record<string, unknown>[] = [];
  const events: AwsRequestAttemptTelemetry[] = [];
  respond = (operation, input) => {
    expect(operation).toBe('CreateResourceExplorerSetup');
    inputs.push(input);
    return inputs.length === 1
      ? jsonResponse({ __type: 'ThrottlingException', Message: 'Synthetic throttle' }, 429)
      : jsonResponse({ TaskId: 'setup-task' });
  };
  await expect(
    run(() => createAwsResourceExplorerSetup({ region: 'eu-west-1', regions: ['eu-west-1'] }), events),
  ).resolves.toMatchObject({ taskId: 'setup-task' });
  expect(inputs).toHaveLength(2);
  expect(inputs[0]).toEqual({ RegionList: ['eu-west-1'], ViewName: 'cloudburn-default' });
  expect(inputs[1]).toEqual(inputs[0]);
  expect(events.map((event) => [event.operation, event.attempt, event.outcome])).toEqual([
    ['CreateResourceExplorerSetup', 1, 'throttled'],
    ['CreateResourceExplorerSetup', 2, 'success'],
  ]);
  expect(events.every((event) => event.quota?.group === 'non-search' && event.quota.region === 'eu-west-1')).toBe(true);
});

it('admits every control-plane page and observes fresh setup, index, and region status polls', async () => {
  const events: AwsRequestAttemptTelemetry[] = [];
  const operations: string[] = [];
  let setupPolls = 0;
  let indexPolls = 0;
  respond = (operation, input) => {
    operations.push(operation);
    if (operation === 'ListIndexes') {
      return jsonResponse({
        Indexes: [{ Region: 'eu-west-1', Type: 'LOCAL' }],
        ...(!input.Regions && !input.NextToken ? { NextToken: 'second-index-page' } : {}),
      });
    }
    if (operation === 'GetDefaultView')
      return jsonResponse({ ViewArn: 'arn:aws:resource-explorer-2:eu-west-1:111111111111:view/default/id' });
    if (operation === 'GetView') return jsonResponse({ View: { IncludedProperties: [] } });
    if (operation === 'UpdateView') return jsonResponse({});
    if (operation === 'GetResourceExplorerSetup') {
      setupPolls += 1;
      return jsonResponse({
        Regions: [{ Region: 'eu-west-1', Index: { Status: setupPolls === 1 ? 'IN_PROGRESS' : 'SUCCEEDED' } }],
      });
    }
    if (operation === 'GetIndex') {
      indexPolls += 1;
      return jsonResponse({
        Arn: 'arn:aws:resource-explorer-2:eu-west-1:111111111111:index/id',
        Type: 'LOCAL',
        State: indexPolls === 1 ? 'CREATING' : 'ACTIVE',
      });
    }
    if (operation === 'UpdateIndexType') return jsonResponse({ State: 'UPDATING', Type: 'AGGREGATOR' });
    if (operation === 'ListSupportedResourceTypes')
      return jsonResponse({
        ResourceTypes: [{ ResourceType: input.NextToken ? 'ec2:volume' : 'ec2:instance' }],
        ...(!input.NextToken ? { NextToken: 'second-type-page' } : {}),
      });
    unexpected.push(operation);
    throw new Error(`Unexpected operation: ${operation}`);
  };
  await run(async () => {
    expect(await listAwsDiscoveryIndexes('eu-west-1')).toHaveLength(2);
    expect(await getAwsDiscoveryRegionStatus('eu-west-1')).toMatchObject({ status: 'indexed', viewStatus: 'present' });
    expect(await getAwsDiscoveryRegionStatus('eu-west-1')).toMatchObject({ status: 'indexed', viewStatus: 'present' });
    await ensureAwsResourceExplorerDefaultViewIncludesTags('eu-west-1');
    expect(await waitForAwsResourceExplorerSetup('task', 'eu-west-1', 2, 0)).toBe('verified');
    expect(await waitForAwsResourceExplorerIndex('eu-west-1', 2, 0)).toBe('verified');
    expect(await updateAwsResourceExplorerIndexType('eu-west-1', 'aggregator')).toMatchObject({
      state: 'UPDATING',
      type: 'aggregator',
    });
    expect(await listAwsDiscoverySupportedResourceTypes()).toEqual([
      { resourceType: 'ec2:instance', service: undefined },
      { resourceType: 'ec2:volume', service: undefined },
    ]);
  }, events);
  expect(setupPolls).toBe(2);
  expect(indexPolls).toBe(3);
  expect(operations.filter((operation) => operation === 'ListIndexes')).toHaveLength(4);
  expect(events.map((event) => event.operation)).toEqual(operations);
  expect(
    events.every(
      (event) =>
        event.dispatched &&
        event.outcome === 'success' &&
        event.quota?.group === 'non-search' &&
        event.quota.region === 'eu-west-1',
    ),
  ).toBe(true);
});
