import { join } from 'node:path';
import type { AwsDiscoveryProgressEvent, CloudBurnClient, ScanResult } from '@cloudburn/sdk';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCloudBurnServer } from '../src/server.js';

const scanResult: ScanResult = { providers: [] };
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

const connect = async (sdk: Partial<CloudBurnClient>, env: NodeJS.ProcessEnv = { XDG_CACHE_HOME: '/cache' }) => {
  const server = createCloudBurnServer({ createClient: () => sdk as CloudBurnClient, env });
  const client = new Client({ name: 'test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  closers.push(
    () => client.close(),
    () => server.close(),
  );
  return client;
};

const callTool = async (client: Client, name: string, args: Record<string, unknown>) => {
  const result = await client.callTool({ name, arguments: args });
  const [content] = result.content as Array<{ text: string }>;
  return { isError: result.isError === true, body: JSON.parse(content?.text ?? 'null') };
};

describe('discover', () => {
  it('runs one explicit region with the CLI evidence cache, deadline, rule selection, and cancellation signal', async () => {
    const discover = vi.fn().mockResolvedValue(scanResult);
    const client = await connect({ discover });

    const { isError, body } = await callTool(client, 'discover', {
      region: 'eu-central-1',
      timeoutSeconds: 600,
      cache: 'refresh',
      configPath: '/work/team.cloudburn.yml',
      enabledRules: ['CLDBRN-AWS-EBS-1'],
      services: ['EBS'],
    });

    expect(isError).toBe(false);
    expect(body).toEqual(scanResult);
    expect(discover).toHaveBeenCalledOnce();
    const [options] = discover.mock.calls[0] ?? [];
    expect(options).toMatchObject({
      cache: { mode: 'refresh', directory: join('/cache', 'cloudburn', 'evidence') },
      target: { mode: 'regions', regions: ['eu-central-1'] },
      configPath: '/work/team.cloudburn.yml',
      config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1'], services: ['ebs'] } },
      timeoutMs: 600_000,
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.onProgress).toBeUndefined();
  });

  it('defaults to the current region, the normal cache mode, and the home cache directory', async () => {
    const discover = vi.fn().mockResolvedValue(scanResult);
    const client = await connect({ discover }, {});

    await callTool(client, 'discover', {});

    const [options] = discover.mock.calls[0] ?? [];
    expect(options.target).toEqual({ mode: 'current' });
    expect(options.cache.mode).toBe('normal');
    expect(options.cache.directory).toMatch(/[/\\]\.cache[/\\]cloudburn[/\\]evidence$/);
    expect(options).not.toHaveProperty('config');
    expect(options).not.toHaveProperty('timeoutMs');
  });

  it('rejects an unsupported region before calling AWS', async () => {
    const discover = vi.fn();
    const client = await connect({ discover });

    const { isError, body } = await callTool(client, 'discover', { region: 'moon-east-1' });

    expect(isError).toBe(true);
    expect(body.error.code).toBe('INVALID_AWS_REGION');
    expect(discover).not.toHaveBeenCalled();
  });

  it('forwards discovery progress to clients that request it', async () => {
    const events: AwsDiscoveryProgressEvent[] = [
      { kind: 'catalog', resourceCount: 12, searchRegion: 'eu-west-1' },
      { kind: 'dataset', completedDatasets: 1, totalDatasets: 3, datasetKey: 'aws-ebs-volumes' },
    ];
    const discover = vi.fn(async (options: { onProgress?: (event: AwsDiscoveryProgressEvent) => void }) => {
      for (const event of events) options.onProgress?.(event);
      return scanResult;
    });
    const client = await connect({ discover });
    const progress: Array<{ progress: number; message?: string }> = [];

    await client.callTool(
      { name: 'discover', arguments: {} },
      { onprogress: (update) => progress.push({ progress: update.progress, message: update.message }) },
    );

    expect(progress).toEqual([
      { progress: 1, message: 'Catalog ready with 12 resources from eu-west-1' },
      { progress: 2, message: 'Datasets 1/3 loaded (aws-ebs-volumes)' },
    ]);
  });
});

describe('tool errors', () => {
  it('reports missing credentials with guidance instead of the provider message', async () => {
    const error = Object.assign(new Error('Could not load credentials from any providers'), {
      name: 'CredentialsProviderError',
    });
    const client = await connect({ discover: vi.fn().mockRejectedValue(error) });

    const { isError, body } = await callTool(client, 'discover', {});

    expect(isError).toBe(true);
    expect(body.error.code).toBe('CREDENTIALS_ERROR');
    expect(body.error.message).toMatch(/AWS_PROFILE/);
  });

  it('redacts signed request parameters and metadata endpoints from runtime errors', async () => {
    const error = new Error(
      'Request to http://169.254.169.254/latest failed: https://s3.amazonaws.com/b?X-Amz-Signature=secret123&x=1',
    );
    const client = await connect({ getDiscoveryStatus: vi.fn().mockRejectedValue(error) });

    const { isError, body } = await callTool(client, 'discovery_status', {});

    expect(isError).toBe(true);
    expect(body.error.code).toBe('RUNTIME_ERROR');
    expect(body.error.message).not.toMatch(/secret123|169\.254\.169\.254/);
    expect(body.error.message).toContain('X-Amz-Signature=[redacted]');
  });
});
