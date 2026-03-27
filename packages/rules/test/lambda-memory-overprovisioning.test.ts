import { describe, expect, it } from 'vitest';
import { lambdaMemoryOverprovisioningRule } from '../src/aws/lambda/memory-overprovisioning.js';
import type { AwsLambdaFunction, AwsLambdaFunctionMetric } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createLambdaFunction = (overrides: Partial<AwsLambdaFunction> = {}): AwsLambdaFunction => ({
  accountId: '123456789012',
  architectures: ['x86_64'],
  functionName: 'my-function',
  memorySizeMb: 512,
  region: 'us-east-1',
  timeoutSeconds: 60,
  ...overrides,
});

const createLambdaFunctionMetric = (overrides: Partial<AwsLambdaFunctionMetric> = {}): AwsLambdaFunctionMetric => ({
  accountId: '123456789012',
  averageDurationMsLast7Days: 10_000,
  functionName: 'my-function',
  region: 'us-east-1',
  totalErrorsLast7Days: 0,
  totalInvocationsLast7Days: 100,
  ...overrides,
});

describe('lambdaMemoryOverprovisioningRule', () => {
  it('flags functions with memory above 256 MB whose average duration uses less than 30% of timeout', () => {
    const finding = lambdaMemoryOverprovisioningRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-lambda-functions': [createLambdaFunction()],
        'aws-lambda-function-metrics': [createLambdaFunctionMetric()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-LAMBDA-4',
      service: 'lambda',
      source: 'discovery',
      message: 'Lambda functions should not keep memory far above their observed execution needs.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'my-function',
        },
      ],
    });
  });

  it('skips functions at or below 256 MB', () => {
    const finding = lambdaMemoryOverprovisioningRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-lambda-functions': [createLambdaFunction({ memorySizeMb: 256 })],
        'aws-lambda-function-metrics': [createLambdaFunctionMetric()],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips functions whose average duration uses 30% or more of timeout', () => {
    const finding = lambdaMemoryOverprovisioningRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-lambda-functions': [createLambdaFunction()],
        'aws-lambda-function-metrics': [createLambdaFunctionMetric({ averageDurationMsLast7Days: 18_000 })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips functions without invocation history', () => {
    const finding = lambdaMemoryOverprovisioningRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-lambda-functions': [createLambdaFunction()],
        'aws-lambda-function-metrics': [createLambdaFunctionMetric({ totalInvocationsLast7Days: null })],
      }),
    });

    expect(finding).toBeNull();
  });
});
