import { describe, expect, it } from 'vitest';
import { lambdaCostOptimalArchitectureRule } from '../src/aws/lambda/cost-optimal-architecture.js';
import type { AwsDiscoveredResource, AwsLambdaFunction, IaCResource, StaticEvaluationContext } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createLambdaFunction = (overrides: Partial<AwsLambdaFunction> = {}): AwsLambdaFunction => ({
  functionName: 'my-function',
  architectures: ['x86_64'],
  region: 'us-east-1',
  accountId: '123456789012',
  ...overrides,
});

const createTerraformResource = (overrides: Partial<IaCResource> = {}): IaCResource => ({
  provider: 'aws',
  type: 'aws_lambda_function',
  name: 'my_function',
  location: {
    path: 'main.tf',
    startLine: 1,
    startColumn: 1,
  },
  attributeLocations: {
    architectures: {
      path: 'main.tf',
      startLine: 5,
      startColumn: 3,
    },
  },
  attributes: {
    architectures: ['x86_64'],
  },
  ...overrides,
});

const createCloudFormationResource = (overrides: Partial<IaCResource> = {}): IaCResource => ({
  provider: 'aws',
  type: 'AWS::Lambda::Function',
  name: 'MyFunction',
  location: {
    path: 'template.yaml',
    startLine: 3,
    startColumn: 3,
  },
  attributeLocations: {
    'Properties.Architectures': {
      path: 'template.yaml',
      startLine: 7,
      startColumn: 7,
    },
  },
  attributes: {
    Properties: {
      Architectures: ['x86_64'],
    },
  },
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
    const staticContext = {
      iacResources: [createTerraformResource()],
    } satisfies StaticEvaluationContext;

    const finding = lambdaCostOptimalArchitectureRule.evaluateStatic?.(staticContext);

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
            startLine: 5,
            startColumn: 3,
          },
        },
      ],
    });
  });

  it('flags Terraform resource with no architectures attribute', () => {
    const finding = lambdaCostOptimalArchitectureRule.evaluateStatic?.({
      iacResources: [
        createTerraformResource({
          attributes: {},
          attributeLocations: {},
        }),
      ],
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
            startLine: 1,
            startColumn: 1,
          },
        },
      ],
    });
  });

  it('flags CloudFormation AWS::Lambda::Function with x86_64 architecture', () => {
    const finding = lambdaCostOptimalArchitectureRule.evaluateStatic?.({
      iacResources: [createCloudFormationResource()],
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
            startLine: 7,
            startColumn: 7,
          },
        },
      ],
    });
  });

  it('flags CloudFormation resource with no Architectures property', () => {
    const finding = lambdaCostOptimalArchitectureRule.evaluateStatic?.({
      iacResources: [
        createCloudFormationResource({
          attributes: {
            Properties: {},
          },
          attributeLocations: {},
        }),
      ],
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
            startLine: 3,
            startColumn: 3,
          },
        },
      ],
    });
  });

  it('skips arm64 Terraform resource', () => {
    const finding = lambdaCostOptimalArchitectureRule.evaluateStatic?.({
      iacResources: [
        createTerraformResource({
          attributes: { architectures: ['arm64'] },
        }),
      ],
    });

    expect(finding).toBeNull();
  });

  it('skips Terraform resource when architectures are computed', () => {
    const finding = lambdaCostOptimalArchitectureRule.evaluateStatic?.({
      iacResources: [
        createTerraformResource({
          attributes: { architectures: 'var.lambda_architectures' },
        }),
      ],
    });

    expect(finding).toBeNull();
  });

  it('skips CloudFormation resource when Architectures uses an intrinsic value', () => {
    const finding = lambdaCostOptimalArchitectureRule.evaluateStatic?.({
      iacResources: [
        createCloudFormationResource({
          attributes: {
            Properties: {
              Architectures: { Ref: 'LambdaArchitectures' },
            },
          },
        }),
      ],
    });

    expect(finding).toBeNull();
  });

  it('skips non-Lambda resource type', () => {
    const finding = lambdaCostOptimalArchitectureRule.evaluateStatic?.({
      iacResources: [
        createTerraformResource({
          type: 'aws_instance',
          name: 'web',
          attributes: { instance_type: 't3.micro' },
        }),
      ],
    });

    expect(finding).toBeNull();
  });
});
