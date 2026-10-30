import { describe, expect, it, vi } from 'vitest';
import type { AwsCapabilityScope, AwsDiscoveryTarget } from '../src/index.js';
import {
  capabilitiesOf,
  discoverRules,
  expectReadOnlyRequests,
  requests,
  scenario,
  settleOnFakeTimers,
  useDiscoveryHttpHarness,
  useLambdaScenario,
} from './helpers/discovery-http.js';

useDiscoveryHttpHarness();

describe('live capability outcomes', () => {
  it('keeps catalog access failures separate from unassessed Compute Optimizer enrollment', async () => {
    scenario.failOperation = 'ListResources';
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
    scenario.optInOperation = 'GetLambdaFunctionRecommendations';
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
    scenario.enabledRegions = ['eu-west-1', 'us-east-1'];
    scenario.aggregatorIndex = true;
    useLambdaScenario(['eu-west-1', 'us-east-1']);
    scenario.lambdaRecommendationsByRegion = {
      'eu-west-1': [
        {
          accountId: '111111111111',
          finding: 'NotOptimized',
          functionArn: 'arn:aws:lambda:eu-west-1:111111111111:function:fn-eu-west-1',
        },
      ],
    };
    scenario.transientOperation = 'GetLambdaFunctionRecommendations';
    scenario.transientHostname = 'compute-optimizer.us-east-1.amazonaws.com';
    vi.useFakeTimers();
    const pending = discoverRules(['CLDBRN-AWS-LAMBDA-4'], {
      mode: 'regions',
      regions: ['eu-west-1', 'us-east-1'],
    });
    const result = await settleOnFakeTimers(pending, 'GetLambdaFunctionRecommendations');

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
      scenario.aggregatorIndex = true;
      scenario.enabledRegions = ['eu-west-1', 'us-east-1'];
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
    scenario.enabledRegions = ['eu-west-1', 'us-east-1'];
    scenario.aggregatorIndex = true;
    useLambdaScenario(['eu-west-1']);
    scenario.lambdaRecommendationsByRegion = {
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
    scenario.enabledRegions = ['eu-west-1', 'us-east-1'];
    scenario.aggregatorIndex = true;
    useLambdaScenario(['eu-west-1']);
    scenario.lambdaRecommendationsByRegion = {
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
});
