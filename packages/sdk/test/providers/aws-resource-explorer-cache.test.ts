import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STSClient } from '@aws-sdk/client-sts';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMemoryEvidenceCacheStore } from '../../src/evidence-cache.js';
import * as clientModule from '../../src/providers/aws/client.js';
import { withAwsEvidenceCache } from '../../src/providers/aws/evidence.js';
import { getAwsExecutionSignal, withAwsDiscoveryExecution } from '../../src/providers/aws/execution.js';
import { buildAwsDiscoveryCatalog, listAwsResourcesByFilter } from '../../src/providers/aws/resource-explorer.js';

let admissionDirectory: string;
beforeEach(() => {
  admissionDirectory = mkdtempSync(join(tmpdir(), 'cloudburn-catalog-cache-'));
  vi.stubEnv('CLOUDBURN_AWS_ADMISSION_DIR', admissionDirectory);
  vi.stubEnv(
    'CLOUDBURN_AWS_QUOTA_OVERRIDES',
    JSON.stringify({
      'resource-explorer-2:non-search': { ratePerSecond: 1000, burst: 1000 },
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(admissionDirectory, { recursive: true, force: true });
});

it('reuses each catalog resource type across scans while checking the current view', { timeout: 30_000 }, async () => {
  vi.spyOn(STSClient.prototype, 'send').mockResolvedValue({
    Account: '123456789012',
    Arn: 'arn:aws:iam::123456789012:user/test',
    UserId: 'test',
  } as never);
  const requests: string[] = [];
  vi.spyOn(clientModule, 'createResourceExplorerClient').mockImplementation(
    () =>
      ({
        send: vi.fn(async (command) => {
          requests.push(command.constructor.name);
          if (command.input.Regions) return { Indexes: [{ Region: 'eu-west-1', Type: 'AGGREGATOR' }] };
          if (command.input.Filters)
            return {
              Resources: command.input.Filters.FilterString.split(' ')[0]
                .slice('resourcetype:'.length)
                .split(',')
                .map((resourceType: string) => ({
                  Arn: `arn:aws:ec2:eu-west-1:123456789012:${resourceType}`,
                  OwningAccountId: '123456789012',
                  Region: 'eu-west-1',
                  Service: 'ec2',
                  ResourceType: resourceType,
                })),
            };
          return {
            ViewArn: 'arn:aws:resource-explorer-2:eu-west-1:123456789012:view/default/id',
            View: { Filters: { FilterString: '' }, IncludedProperties: [{ Name: 'tags' }] },
          };
        }),
      }) as never,
  );
  const cache = { store: createMemoryEvidenceCacheStore(), authorizationContext: 'test-policy-v1' };
  const target = { mode: 'region' as const, region: 'eu-west-1' };
  const scan = (types: string[]) =>
    clientModule.withAwsClientCredentials({ accessKeyId: 'SYNTHETIC', secretAccessKey: 'SYNTHETIC' }, () =>
      withAwsDiscoveryExecution({}, () =>
        withAwsEvidenceCache({ cache, target }, () => buildAwsDiscoveryCatalog(target, types)),
      ),
    );
  const initialTypes = Array.from({ length: 36 }, (_, index) => `ec2:resource${index}`);
  const first = await scan(initialTypes);
  expect(first.resources).toHaveLength(36);
  expect(await scan(initialTypes)).toEqual(first);
  expect((await scan([...initialTypes, 'ec2:instance'])).resources).toHaveLength(37);
  expect(requests.filter((name) => name === 'ListIndexesCommand')).toHaveLength(1);
  expect(requests.filter((name) => name === 'ListResourcesCommand')).toHaveLength(2);
  expect(requests.filter((name) => name === 'GetDefaultViewCommand')).toHaveLength(3);
  expect(requests.filter((name) => name === 'GetViewCommand')).toHaveLength(3);
});

it('invalidates cached resources when the view scope changes and rejects newly filtered views', async () => {
  vi.spyOn(STSClient.prototype, 'send').mockResolvedValue({
    Account: '123456789012',
    Arn: 'arn:aws:iam::123456789012:user/test',
    UserId: 'test',
  } as never);
  let viewArn = 'arn:aws:resource-explorer-2:eu-west-1:123456789012:view/default/id';
  let filterString = '';
  let scope = 'arn:aws:iam::123456789012:root';
  let includedProperties = [{ Name: 'tags' }];
  let denied = false;
  let resourceLists = 0;
  vi.spyOn(clientModule, 'createResourceExplorerClient').mockImplementation(
    () =>
      ({
        send: vi.fn(async (command) => {
          if (command.input.Regions) return { Indexes: [{ Region: 'eu-west-1', Type: 'AGGREGATOR' }] };
          if (command.input.Filters) {
            resourceLists += 1;
            return { Resources: [] };
          }
          if (denied) throw Object.assign(new Error('Synthetic denied view'), { name: 'AccessDeniedException' });
          return {
            ViewArn: viewArn,
            View: { Scope: scope, Filters: { FilterString: filterString }, IncludedProperties: includedProperties },
          };
        }),
      }) as never,
  );
  const cache = { store: createMemoryEvidenceCacheStore(), authorizationContext: 'test-policy-v1' };
  const target = { mode: 'region' as const, region: 'eu-west-1' };
  const scan = () =>
    clientModule.withAwsClientCredentials({ accessKeyId: 'SYNTHETIC', secretAccessKey: 'SYNTHETIC' }, () =>
      withAwsDiscoveryExecution({}, () =>
        withAwsEvidenceCache({ cache, target }, () => buildAwsDiscoveryCatalog(target, ['ec2:volume'])),
      ),
    );
  await scan();
  await scan();
  expect(resourceLists).toBe(1);
  viewArn = 'arn:aws:resource-explorer-2:eu-west-1:123456789012:view/replacement/id';
  await scan();
  scope = 'arn:aws:organizations::123456789012:organization/o-test';
  await scan();
  includedProperties = [];
  await scan();
  expect(resourceLists).toBe(4);
  filterString = 'service:ec2';
  await expect(scan()).rejects.toThrow('applies additional filters');
  filterString = '';
  denied = true;
  await expect(scan()).rejects.toThrow('Synthetic denied view');
  expect(resourceLists).toBe(4);
});

it('reuses auxiliary filter results only while the required view properties remain available', async () => {
  vi.spyOn(STSClient.prototype, 'send').mockResolvedValue({
    Account: '123456789012',
    Arn: 'arn:aws:iam::123456789012:user/test',
    UserId: 'test',
  } as never);
  let includedProperties = [{ Name: 'tags' }];
  let resourceLists = 0;
  vi.spyOn(clientModule, 'createResourceExplorerClient').mockImplementation(
    () =>
      ({
        send: vi.fn(async (command) => {
          if (command.input.Regions) return { Indexes: [{ Region: 'eu-west-1', Type: 'AGGREGATOR' }] };
          if (command.input.Filters) {
            resourceLists += 1;
            return { Resources: [] };
          }
          return { ViewArn: 'view', View: { Filters: { FilterString: '' }, IncludedProperties: includedProperties } };
        }),
      }) as never,
  );
  const cache = { store: createMemoryEvidenceCacheStore(), authorizationContext: 'test-policy-v1' };
  const target = { mode: 'region' as const, region: 'eu-west-1' };
  const scan = () =>
    clientModule.withAwsClientCredentials({ accessKeyId: 'SYNTHETIC', secretAccessKey: 'SYNTHETIC' }, () =>
      withAwsDiscoveryExecution({}, () =>
        withAwsEvidenceCache({ cache, target }, () =>
          listAwsResourcesByFilter(target, 'resourcetype.supports:tags tag:none', { requiredViewProperties: ['tags'] }),
        ),
      ),
    );
  expect(await scan()).toEqual([]);
  expect(await scan()).toEqual([]);
  expect(resourceLists).toBe(1);
  includedProperties = [];
  await expect(scan()).rejects.toThrow("does not include the 'tags' property");
  expect(resourceLists).toBe(1);
});

it.each([
  false,
  true,
])('keeps a packed refresh alive until every participating type is abandoned (cancel last: %s)', async (cancelLast) => {
  vi.spyOn(STSClient.prototype, 'send').mockResolvedValue({
    Account: '123456789012',
    Arn: 'arn:aws:iam::123456789012:user/test',
    UserId: 'test',
  } as never);
  let releaseBatch = () => undefined;
  let markBatchStarted = () => undefined;
  const heldBatch = new Promise<void>((resolve) => {
    releaseBatch = resolve;
  });
  const batchStarted = new Promise<void>((resolve) => {
    markBatchStarted = resolve;
  });
  let batchSignal: AbortSignal | undefined;
  let viewRequests = 0;
  let resourceLists = 0;
  vi.spyOn(clientModule, 'createResourceExplorerClient').mockImplementation(
    () =>
      ({
        send: vi.fn(async (command) => {
          if (command.input.Regions) return { Indexes: [{ Region: 'eu-west-1', Type: 'AGGREGATOR' }] };
          if (command.input.Filters) {
            resourceLists += 1;
            batchSignal = getAwsExecutionSignal();
            markBatchStarted();
            await heldBatch;
            batchSignal?.throwIfAborted();
            return {
              Resources: ['ec2:volume', 'ec2:instance'].map((resourceType) => ({
                Arn: `arn:aws:ec2:eu-west-1:123456789012:${resourceType}`,
                OwningAccountId: '123456789012',
                Region: 'eu-west-1',
                Service: 'ec2',
                ResourceType: resourceType,
              })),
            };
          }
          if (command.constructor.name === 'GetViewCommand') viewRequests += 1;
          return { ViewArn: 'view', View: { Filters: { FilterString: '' } } };
        }),
      }) as never,
  );
  const cache = { store: createMemoryEvidenceCacheStore(), authorizationContext: 'test-policy-v1' };
  const target = { mode: 'region' as const, region: 'eu-west-1' };
  const scan = (types: string[], signal: AbortSignal) =>
    clientModule.withAwsClientCredentials({ accessKeyId: 'SYNTHETIC', secretAccessKey: 'SYNTHETIC' }, () =>
      withAwsDiscoveryExecution({ signal }, () =>
        withAwsEvidenceCache({ cache, target }, () => buildAwsDiscoveryCatalog(target, types)),
      ),
    );
  const firstController = new AbortController();
  const lastController = new AbortController();
  const first = scan(['ec2:volume', 'ec2:instance'], firstController.signal).catch((error: unknown) => error);
  await batchStarted;
  const last = scan(['ec2:instance'], lastController.signal).catch((error: unknown) => error);
  try {
    await vi.waitFor(() => expect(viewRequests).toBe(2));
    // Let the second scan complete its cache probe and attach to the type flight.
    await new Promise<void>((resolve) => setImmediate(resolve));
    firstController.abort(new Error('first caller cancelled'));
    expect(await first).toMatchObject({ message: 'first caller cancelled' });
    expect(batchSignal?.aborted).toBe(false);
    if (cancelLast) {
      lastController.abort(new Error('last caller cancelled'));
      expect(await last).toMatchObject({ message: 'last caller cancelled' });
      await vi.waitFor(() => expect(batchSignal?.aborted).toBe(true));
    } else {
      releaseBatch();
      expect(await last).toMatchObject({ resources: [{ resourceType: 'ec2:instance' }] });
    }
    expect(resourceLists).toBe(1);
  } finally {
    releaseBatch();
    await Promise.all([first, last]);
  }
});
