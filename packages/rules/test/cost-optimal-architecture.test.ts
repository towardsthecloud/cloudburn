import { describe, expect, it } from 'vitest';
import { lambdaCostOptimalArchitectureRule } from '../src/aws/lambda/cost-optimal-architecture.js';
import type { AwsDiscoveredResource, AwsLambdaFunction, AwsStaticLambdaFunction } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const createLambdaFunction = (overrides: Partial<AwsLambdaFunction> = {}): AwsLambdaFunction => ({
  functionName: 'my-function',
  architectures: ['x86_64'],
  region: 'us-east-1',
  accountId: '123456789012',
  timeoutSeconds: 60,
  ...overrides,
});

const createStaticLambdaFunction = (overrides: Partial<AwsStaticLambdaFunction> = {}): AwsStaticLambdaFunction => ({
  architectures: ['x86_64'],
  location: {
    path: 'main.tf',
    line: 5,
    column: 3,
  },
  resourceId: 'aws_lambda_function.my_function',
  ...overrides,
});

const createDiscoveredResource = (overrides: Partial<AwsDiscoveredResource> = {}): AwsDiscoveredResource => ({
  arn: 'arn:aws:lambda:us-east-1:123456789012:function:my-function',
  accountId: '123456789012',
  region: 'us-east-1',
  service: 'lambda',
  resourceType: 'lambda:function',
  properties: [],
  ...overrides,
});

describe('lambdaCostOptimalArchitectureRule', () => {
  it('flags x86_64 functions in discovery mode', () => {
    const finding = lambdaCostOptimalArchitectureRule.evaluateLive?.({
      catalog: {
        resources: [createDiscoveredResource()],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-lambda-functions': [createLambdaFunction()],
      }),
    });

    expect(lambdaCostOptimalArchitectureRule.discoveryDependencies).toEqual(['aws-lambda-functions']);
    expect(lambdaCostOptimalArchitectureRule.staticDependencies).toEqual(['aws-lambda-functions']);
    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-LAMBDA-1',
      service: 'lambda',
      source: 'discovery',
      message: 'Lambda functions should use arm64 architecture when compatible to reduce running costs.',
      findings: [
        {
          resourceId: 'my-function',
          region: 'us-east-1',
          accountId: '123456789012',
        },
      ],
    });
  });

  it('skips arm64 functions in discovery mode', () => {
    const finding = lambdaCostOptimalArchitectureRule.evaluateLive?.({
      catalog: {
        resources: [createDiscoveredResource()],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-lambda-functions': [createLambdaFunction({ architectures: ['arm64'] })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('flags Terraform aws_lambda_function with x86_64 architecture', () => {
    const finding = lambdaCostOptimalArchitectureRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-lambda-functions': [createStaticLambdaFunction()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-LAMBDA-1',
      service: 'lambda',
      source: 'iac',
      message: 'Lambda functions should use arm64 architecture when compatible to reduce running costs.',
      findings: [
        {
          resourceId: 'aws_lambda_function.my_function',
          location: {
            path: 'main.tf',
            line: 5,
            column: 3,
          },
        },
      ],
    });
  });

  it('flags Terraform resource with no architectures attribute', () => {
    const finding = lambdaCostOptimalArchitectureRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-lambda-functions': [
          createStaticLambdaFunction({
            architectures: ['x86_64'],
            location: {
              path: 'main.tf',
              line: 1,
              column: 1,
            },
          }),
        ],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-LAMBDA-1',
      service: 'lambda',
      source: 'iac',
      message: 'Lambda functions should use arm64 architecture when compatible to reduce running costs.',
      findings: [
        {
          resourceId: 'aws_lambda_function.my_function',
          location: {
            path: 'main.tf',
            line: 1,
            column: 1,
          },
        },
      ],
    });
  });

  it('flags CloudFormation AWS::Lambda::Function with x86_64 architecture', () => {
    const finding = lambdaCostOptimalArchitectureRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-lambda-functions': [
          createStaticLambdaFunction({
            location: {
              path: 'template.yaml',
              line: 7,
              column: 7,
            },
            resourceId: 'MyFunction',
          }),
        ],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-LAMBDA-1',
      service: 'lambda',
      source: 'iac',
      message: 'Lambda functions should use arm64 architecture when compatible to reduce running costs.',
      findings: [
        {
          resourceId: 'MyFunction',
          location: {
            path: 'template.yaml',
            line: 7,
            column: 7,
          },
        },
      ],
    });
  });

  it('flags CloudFormation resource with no Architectures property', () => {
    const finding = lambdaCostOptimalArchitectureRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-lambda-functions': [
          createStaticLambdaFunction({
            architectures: ['x86_64'],
            location: {
              path: 'template.yaml',
              line: 3,
              column: 3,
            },
            resourceId: 'MyFunction',
          }),
        ],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-LAMBDA-1',
      service: 'lambda',
      source: 'iac',
      message: 'Lambda functions should use arm64 architecture when compatible to reduce running costs.',
      findings: [
        {
          resourceId: 'MyFunction',
          location: {
            path: 'template.yaml',
            line: 3,
            column: 3,
          },
        },
      ],
    });
  });

  it('skips arm64 Terraform resource', () => {
    const finding = lambdaCostOptimalArchitectureRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-lambda-functions': [
          createStaticLambdaFunction({
            architectures: ['arm64'],
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips Terraform resource when architectures are computed', () => {
    const finding = lambdaCostOptimalArchitectureRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-lambda-functions': [
          createStaticLambdaFunction({
            architectures: null,
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips CloudFormation resource when Architectures uses an intrinsic value', () => {
    const finding = lambdaCostOptimalArchitectureRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-lambda-functions': [
          createStaticLambdaFunction({
            architectures: null,
            resourceId: 'MyFunction',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips non-Lambda resource type', () => {
    const finding = lambdaCostOptimalArchitectureRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-lambda-functions': [],
      }),
    });

    expect(finding).toBeNull();
  });
});
