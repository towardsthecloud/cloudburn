import { describe, expect, it } from 'vitest';
import { lambdaHighErrorRateRule } from '../src/aws/lambda/high-error-rate.js';
import type { AwsLambdaFunction, AwsLambdaFunctionMetric } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createLambdaFunction = (overrides: Partial<AwsLambdaFunction> = {}): AwsLambdaFunction => ({
  accountId: '123456789012',
  architectures: ['x86_64'],
  functionName: 'my-function',
  region: 'us-east-1',
  timeoutSeconds: 60,
  ...overrides,
});

const createLambdaFunctionMetric = (overrides: Partial<AwsLambdaFunctionMetric> = {}): AwsLambdaFunctionMetric => ({
  accountId: '123456789012',
  averageDurationMsLast7Days: 1500,
  functionName: 'my-function',
  region: 'us-east-1',
  totalErrorsLast7Days: 11,
  totalInvocationsLast7Days: 100,
  ...overrides,
});

describe('lambdaHighErrorRateRule', () => {
  it('flags Lambda functions whose 7-day error rate exceeds 10 percent', () => {
    const finding = lambdaHighErrorRateRule.evaluateLive?.({
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
      ruleId: 'CLDBRN-AWS-LAMBDA-2',
      service: 'lambda',
      source: 'discovery',
      message: 'Lambda functions should not sustain an error rate above 10% over the last 7 days.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'my-function',
        },
      ],
    });
  });

  it('skips functions whose 7-day error rate stays at or below 10 percent', () => {
    const finding = lambdaHighErrorRateRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-lambda-functions': [createLambdaFunction()],
        'aws-lambda-function-metrics': [createLambdaFunctionMetric({ totalErrorsLast7Days: 10 })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips functions when invocation coverage is unavailable', () => {
    const finding = lambdaHighErrorRateRule.evaluateLive?.({
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

  it('matches metrics by account and region when duplicate function names exist', () => {
    const finding = lambdaHighErrorRateRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-lambda-functions': [
          createLambdaFunction(),
          createLambdaFunction({
            accountId: '210987654321',
            region: 'us-west-2',
          }),
        ],
        'aws-lambda-function-metrics': [
          createLambdaFunctionMetric(),
          createLambdaFunctionMetric({
            accountId: '210987654321',
            region: 'us-west-2',
            totalErrorsLast7Days: 0,
          }),
        ],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        resourceId: 'my-function',
      },
    ]);
  });
});
