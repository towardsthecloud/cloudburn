import { describe, expect, it } from 'vitest';
import { apiGatewayCachingDisabledRule } from '../src/aws/apigateway/caching-disabled.js';
import type { AwsApiGatewayStage } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createStage = (overrides: Partial<AwsApiGatewayStage> = {}): AwsApiGatewayStage => ({
  accountId: '123456789012',
  cacheClusterEnabled: false,
  region: 'us-east-1',
  restApiId: 'a1b2c3d4',
  stageArn: 'arn:aws:apigateway:us-east-1::/restapis/a1b2c3d4/stages/prod',
  stageName: 'prod',
  ...overrides,
});

describe('apiGatewayCachingDisabledRule', () => {
  it('flags REST API stages with caching disabled', () => {
    const finding = apiGatewayCachingDisabledRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-apigateway-stages': [createStage()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        resourceId: 'arn:aws:apigateway:us-east-1::/restapis/a1b2c3d4/stages/prod',
      },
    ]);
  });

  it('does not flag REST API stages with caching enabled', () => {
    const finding = apiGatewayCachingDisabledRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-apigateway-stages': [createStage({ cacheClusterEnabled: true })],
      }),
    });

    expect(finding).toBeNull();
  });
});
