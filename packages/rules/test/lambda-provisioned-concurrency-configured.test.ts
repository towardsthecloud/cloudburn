import { describe, expect, it } from 'vitest';
import { lambdaProvisionedConcurrencyConfiguredRule } from '../src/aws/lambda/provisioned-concurrency-configured.js';
import type { AwsStaticLambdaProvisionedConcurrency } from '../src/index.js';
import { StaticResourceBag } from '../src/index.js';

const createConfig = (
  overrides: Partial<AwsStaticLambdaProvisionedConcurrency> = {},
): AwsStaticLambdaProvisionedConcurrency => ({
  location: {
    path: 'main.tf',
    line: 5,
    column: 3,
  },
  provisionedConcurrentExecutions: 10,
  resourceId: 'aws_lambda_provisioned_concurrency_config.worker',
  ...overrides,
});

describe('lambdaProvisionedConcurrencyConfiguredRule', () => {
  it('flags explicit provisioned concurrency configuration', () => {
    const finding = lambdaProvisionedConcurrencyConfiguredRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-lambda-provisioned-concurrency': [createConfig()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-LAMBDA-5',
      service: 'lambda',
      source: 'iac',
      message: 'Lambda provisioned concurrency should be reviewed for steady low-latency demand.',
      findings: [
        {
          location: {
            path: 'main.tf',
            line: 5,
            column: 3,
          },
          resourceId: 'aws_lambda_provisioned_concurrency_config.worker',
        },
      ],
    });
  });

  it('skips empty or zero-valued provisioned concurrency configuration', () => {
    const finding = lambdaProvisionedConcurrencyConfiguredRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-lambda-provisioned-concurrency': [
          createConfig({ provisionedConcurrentExecutions: 0 }),
          createConfig({ resourceId: 'WorkerAlias', provisionedConcurrentExecutions: null }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
