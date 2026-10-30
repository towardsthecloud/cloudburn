import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CloudBurnClient } from '../src/index.js';
import {
  admissionDirectory,
  debugMessages,
  held,
  type RegionsCacheDiscoverOptions,
  requests,
  scenario,
  useDiscoveryHttpHarness,
  useElbScenario,
} from './helpers/discovery-http.js';

useDiscoveryHttpHarness();

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
    scenario.denyIdentity = true;
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
    scenario.denyVolumes = true;
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
    scenario.includeNewVolume = true;
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
    scenario.viewScope = 'arn:aws:organizations::222222222222:organization/o-synthetic';
    await client.discover(scan);
    expect(requests.filter(({ operation }) => operation === 'DescribeVolumes')).toHaveLength(2);
  });

  it('keeps a shared hydration alive when its first scan is cancelled', async () => {
    scenario.holdOperation = 'DescribeVolumes';
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
