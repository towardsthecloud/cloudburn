import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CloudBurnClient } from '../src/index.js';
import {
  admissionDirectory,
  debugMessages,
  discover,
  identity,
  metricRequests,
  region,
  requests,
  useDiscoveryHttpHarness,
  useElbScenario,
} from './helpers/discovery-http.js';

useDiscoveryHttpHarness();

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
