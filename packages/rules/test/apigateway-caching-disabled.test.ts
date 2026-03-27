import { describe, expect, it } from 'vitest';
import { apiGatewayCachingDisabledRule } from '../src/aws/apigateway/caching-disabled.js';
import type { AwsApiGatewayStage, AwsStaticApiGatewayStage } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const createStage = (overrides: Partial<AwsApiGatewayStage> = {}): AwsApiGatewayStage => ({
  accountId: '123456789012',
  cacheClusterEnabled: false,
  region: 'us-east-1',
  restApiId: 'a1b2c3d4',
  stageArn: 'arn:aws:apigateway:us-east-1::/restapis/a1b2c3d4/stages/prod',
  stageName: 'prod',
  ...overrides,
});

const createStaticStage = (overrides: Partial<AwsStaticApiGatewayStage> = {}): AwsStaticApiGatewayStage => ({
  resourceId: 'aws_api_gateway_stage.prod',
  cacheClusterEnabled: false,
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

  it('flags static REST API stages with caching disabled', () => {
    const finding = apiGatewayCachingDisabledRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-apigateway-stages': [createStaticStage()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        resourceId: 'aws_api_gateway_stage.prod',
      },
    ]);
  });

  it('does not flag static REST API stages with caching enabled or unknown state', () => {
    const enabledFinding = apiGatewayCachingDisabledRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-apigateway-stages': [createStaticStage({ cacheClusterEnabled: true })],
      }),
    });
    const unknownFinding = apiGatewayCachingDisabledRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-apigateway-stages': [createStaticStage({ cacheClusterEnabled: null })],
      }),
    });

    expect(enabledFinding).toBeNull();
    expect(unknownFinding).toBeNull();
  });
});
