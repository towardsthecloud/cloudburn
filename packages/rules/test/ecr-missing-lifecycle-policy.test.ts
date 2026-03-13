import { describe, expect, it } from 'vitest';
import { ecrMissingLifecyclePolicyRule } from '../src/aws/ecr/missing-lifecycle-policy.js';
import type { AwsEcrRepository, AwsStaticEcrRepository } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const createRepository = (overrides: Partial<AwsEcrRepository> = {}): AwsEcrRepository => ({
  accountId: '123456789012',
  arn: 'arn:aws:ecr:us-east-1:123456789012:repository/app',
  hasLifecyclePolicy: false,
  region: 'us-east-1',
  repositoryName: 'app',
  ...overrides,
});

const createStaticRepository = (overrides: Partial<AwsStaticEcrRepository> = {}): AwsStaticEcrRepository => ({
  hasLifecyclePolicy: false,
  location: {
    path: 'main.tf',
    line: 4,
    column: 3,
  },
  resourceId: 'aws_ecr_repository.app',
  ...overrides,
});

describe('ecrMissingLifecyclePolicyRule', () => {
  it('flags discovery repositories without lifecycle policies', () => {
    const finding = ecrMissingLifecyclePolicyRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ecr-repositories': [createRepository()],
      }),
    });

    expect(ecrMissingLifecyclePolicyRule.discoveryDependencies).toEqual(['aws-ecr-repositories']);
    expect(ecrMissingLifecyclePolicyRule.staticDependencies).toEqual(['aws-ecr-repositories']);
    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-ECR-1',
      service: 'ecr',
      source: 'discovery',
      message: 'ECR repositories should define lifecycle policies.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'app',
        },
      ],
    });
  });

  it('skips discovery repositories that already define lifecycle policies', () => {
    const finding = ecrMissingLifecyclePolicyRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ecr-repositories': [createRepository({ hasLifecyclePolicy: true })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('flags static repositories without lifecycle policies', () => {
    const finding = ecrMissingLifecyclePolicyRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ecr-repositories': [createStaticRepository()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-ECR-1',
      service: 'ecr',
      source: 'iac',
      message: 'ECR repositories should define lifecycle policies.',
      findings: [
        {
          location: {
            path: 'main.tf',
            line: 4,
            column: 3,
          },
          resourceId: 'aws_ecr_repository.app',
        },
      ],
    });
  });

  it('skips static repositories that define lifecycle policies', () => {
    const finding = ecrMissingLifecyclePolicyRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ecr-repositories': [createStaticRepository({ hasLifecyclePolicy: true })],
      }),
    });

    expect(finding).toBeNull();
  });
});
