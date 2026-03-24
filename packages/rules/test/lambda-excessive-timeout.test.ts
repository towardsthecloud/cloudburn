import { describe, expect, it } from 'vitest';
import { lambdaExcessiveTimeoutRule } from '../src/aws/lambda/excessive-timeout.js';
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
  averageDurationMsLast7Days: 5_000,
  functionName: 'my-function',
  region: 'us-east-1',
  totalErrorsLast7Days: 0,
  totalInvocationsLast7Days: 100,
  ...overrides,
});

describe('lambdaExcessiveTimeoutRule', () => {
  it('flags functions whose timeout is at least 30 seconds and 5x their average duration', () => {
    const finding = lambdaExcessiveTimeoutRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-lambda-functions': [createLambdaFunction({ timeoutSeconds: 60 })],
        'aws-lambda-function-metrics': [createLambdaFunctionMetric({ averageDurationMsLast7Days: 10_000 })],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-LAMBDA-3',
      service: 'lambda',
      source: 'discovery',
      message: 'Lambda functions should not keep timeouts far above their observed average duration.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'my-function',
        },
      ],
    });
  });

  it('skips functions whose timeout stays close to their average duration', () => {
    const finding = lambdaExcessiveTimeoutRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-lambda-functions': [createLambdaFunction({ timeoutSeconds: 20 })],
        'aws-lambda-function-metrics': [createLambdaFunctionMetric({ averageDurationMsLast7Days: 10_000 })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips functions when duration coverage is unavailable', () => {
    const finding = lambdaExcessiveTimeoutRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-lambda-functions': [createLambdaFunction()],
        'aws-lambda-function-metrics': [createLambdaFunctionMetric({ averageDurationMsLast7Days: null })],
      }),
    });

    expect(finding).toBeNull();
  });
});
