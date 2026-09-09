import { describe, expect, it } from 'vitest';
import { lambdaMemoryOverprovisioningRule } from '../src/aws/lambda/memory-overprovisioning.js';
import type { AwsLambdaFunction, AwsLambdaMemoryRecommendation, DiscoveryDatasetMap } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const accountId = '123456789012';
const region = 'us-east-1';
const functionArn = (functionName: string) => `arn:aws:lambda:${region}:${accountId}:function:${functionName}`;

const createRecommendation = (
  overrides: Partial<AwsLambdaMemoryRecommendation> = {},
): AwsLambdaMemoryRecommendation => ({
  accountId,
  assessment: 'memory_overprovisioned',
  functionArn: functionArn('my-function'),
  region,
  ...overrides,
});

const createFunction = (functionName: string, overrides: Partial<AwsLambdaFunction> = {}): AwsLambdaFunction => ({
  accountId,
  architectures: ['x86_64'],
  functionArn: functionArn(functionName),
  functionName,
  memorySizeMb: 1024,
  region,
  timeoutSeconds: 30,
  ...overrides,
});

const context = (datasets: Partial<DiscoveryDatasetMap>) => ({
  catalog: { indexType: 'LOCAL' as const, resources: [], searchRegion: region },
  resources: new LiveResourceBag(datasets),
});

const match = (functionName: string) => ({
  accountId,
  region,
  resourceId: functionArn(functionName),
  resourceType: 'lambda:function',
});

describe('lambdaMemoryOverprovisioningRule', () => {
  it('flags functions that Compute Optimizer identifies as memory-overprovisioned', () => {
    const finding = lambdaMemoryOverprovisioningRule.evaluateLive?.(
      context({
        'aws-lambda-functions': [createFunction('my-function')],
        'aws-lambda-memory-recommendations': [createRecommendation()],
      }),
    );

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-LAMBDA-4',
      service: 'lambda',
      severity: 'medium',
      source: 'discovery',
      message: 'Lambda functions should not keep memory far above their observed execution needs.',
      findings: [{ ...match('my-function'), actionType: 'Rightsize' }],
    });
  });

  it('returns no finding when Compute Optimizer has no memory recommendation', () => {
    const finding = lambdaMemoryOverprovisioningRule.evaluateLive?.(
      context({ 'aws-lambda-functions': [createFunction('pending')], 'aws-lambda-memory-recommendations': [] }),
    );

    expect(finding).toBeNull();
  });

  it('does not flag functions whose assessment is not overprovisioned or is unavailable', () => {
    const finding = lambdaMemoryOverprovisioningRule.evaluateLive?.(
      context({
        'aws-lambda-functions': [createFunction('optimized'), createFunction('insufficient-data')],
        'aws-lambda-memory-recommendations': [
          createRecommendation({ assessment: 'not_overprovisioned', functionArn: functionArn('optimized') }),
          createRecommendation({ assessment: 'unavailable', functionArn: functionArn('insufficient-data') }),
        ],
      }),
    );

    expect(finding).toBeNull();
  });
});
