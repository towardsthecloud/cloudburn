import { describe, expect, it } from 'vitest';
import { ecrMissingUntaggedImageExpiryRule } from '../src/aws/ecr/missing-untagged-image-expiry.js';
import type { AwsEcrRepository, AwsStaticEcrRepository } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const createLiveRepository = (overrides: Partial<AwsEcrRepository> = {}): AwsEcrRepository => ({
  accountId: '123456789012',
  arn: 'arn:aws:ecr:us-east-1:123456789012:repository/app',
  hasLifecyclePolicy: true,
  hasTaggedImageRetentionCap: true,
  hasUntaggedImageExpiry: false,
  region: 'us-east-1',
  repositoryName: 'app',
  ...overrides,
});

const createRepository = (overrides: Partial<AwsStaticEcrRepository> = {}): AwsStaticEcrRepository => ({
  hasLifecyclePolicy: true,
  hasTaggedImageRetentionCap: true,
  hasUntaggedImageExpiry: false,
  location: {
    path: 'main.tf',
    line: 4,
    column: 3,
  },
  resourceId: 'aws_ecr_repository.app',
  ...overrides,
});

describe('ecrMissingUntaggedImageExpiryRule', () => {
  it('flags discovery repositories whose lifecycle policy does not expire untagged images', () => {
    const finding = ecrMissingUntaggedImageExpiryRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ecr-repositories': [createLiveRepository()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-ECR-2',
      service: 'ecr',
      severity: 'low',
      source: 'discovery',
      message: 'ECR repositories should expire untagged images.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'app',
        },
      ],
    });
  });

  it('skips discovery repositories without a usable untagged-image policy signal', () => {
    const finding = ecrMissingUntaggedImageExpiryRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ecr-repositories': [
          createLiveRepository({ hasLifecyclePolicy: false, hasUntaggedImageExpiry: null }),
          createLiveRepository({ hasUntaggedImageExpiry: null, repositoryName: 'malformed' }),
          createLiveRepository({ hasUntaggedImageExpiry: true, repositoryName: 'covered' }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('flags Terraform repositories whose lifecycle policy does not expire untagged images', () => {
    const finding = ecrMissingUntaggedImageExpiryRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ecr-repositories': [createRepository()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        resourceId: 'aws_ecr_repository.app',
        location: {
          path: 'main.tf',
          line: 4,
          column: 3,
        },
      },
    ]);
  });

  it('flags CloudFormation repositories whose lifecycle policy does not expire untagged images', () => {
    const finding = ecrMissingUntaggedImageExpiryRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ecr-repositories': [
          createRepository({
            location: {
              path: 'template.yaml',
              line: 6,
              column: 5,
            },
            resourceId: 'AppRepository',
          }),
        ],
      }),
    });

    expect(finding?.findings?.[0]?.resourceId).toBe('AppRepository');
  });

  it('skips repositories without lifecycle policies or with unknown coverage', () => {
    const missingPolicy = ecrMissingUntaggedImageExpiryRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ecr-repositories': [createRepository({ hasLifecyclePolicy: false })],
      }),
    });
    const unknownCoverage = ecrMissingUntaggedImageExpiryRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ecr-repositories': [createRepository({ hasUntaggedImageExpiry: null })],
      }),
    });
    const covered = ecrMissingUntaggedImageExpiryRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ecr-repositories': [createRepository({ hasUntaggedImageExpiry: true })],
      }),
    });

    expect(missingPolicy).toBeNull();
    expect(unknownCoverage).toBeNull();
    expect(covered).toBeNull();
  });
});
