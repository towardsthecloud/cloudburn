import { describe, expect, it } from 'vitest';
import { ecrMissingTaggedImageRetentionCapRule } from '../src/aws/ecr/missing-tagged-image-retention-cap.js';
import type { AwsEcrRepository, AwsStaticEcrRepository } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const createLiveRepository = (overrides: Partial<AwsEcrRepository> = {}): AwsEcrRepository => ({
  accountId: '123456789012',
  arn: 'arn:aws:ecr:us-east-1:123456789012:repository/app',
  hasLifecyclePolicy: true,
  hasTaggedImageRetentionCap: false,
  hasUntaggedImageExpiry: true,
  region: 'us-east-1',
  repositoryName: 'app',
  ...overrides,
});

const createRepository = (overrides: Partial<AwsStaticEcrRepository> = {}): AwsStaticEcrRepository => ({
  hasLifecyclePolicy: true,
  hasTaggedImageRetentionCap: false,
  hasUntaggedImageExpiry: true,
  location: {
    path: 'main.tf',
    line: 4,
    column: 3,
  },
  resourceId: 'aws_ecr_repository.app',
  ...overrides,
});

describe('ecrMissingTaggedImageRetentionCapRule', () => {
  it('flags discovery repositories whose lifecycle policy does not cap tagged image retention', () => {
    const finding = ecrMissingTaggedImageRetentionCapRule.evaluateLive?.({
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
      ruleId: 'CLDBRN-AWS-ECR-3',
      service: 'ecr',
      severity: 'low',
      source: 'discovery',
      message: 'ECR repositories should cap tagged image retention.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'app',
        },
      ],
    });
  });

  it('skips discovery repositories without a usable tagged-image policy signal', () => {
    const finding = ecrMissingTaggedImageRetentionCapRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ecr-repositories': [
          createLiveRepository({ hasLifecyclePolicy: false, hasTaggedImageRetentionCap: null }),
          createLiveRepository({ hasTaggedImageRetentionCap: null, repositoryName: 'malformed' }),
          createLiveRepository({ hasTaggedImageRetentionCap: true, repositoryName: 'covered' }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('flags Terraform repositories whose lifecycle policy does not cap tagged image retention', () => {
    const finding = ecrMissingTaggedImageRetentionCapRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ecr-repositories': [createRepository()],
      }),
    });

    expect(finding?.findings?.[0]?.resourceId).toBe('aws_ecr_repository.app');
  });

  it('flags CloudFormation repositories whose lifecycle policy does not cap tagged image retention', () => {
    const finding = ecrMissingTaggedImageRetentionCapRule.evaluateStatic?.({
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
    const missingPolicy = ecrMissingTaggedImageRetentionCapRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ecr-repositories': [createRepository({ hasLifecyclePolicy: false })],
      }),
    });
    const unknownCoverage = ecrMissingTaggedImageRetentionCapRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ecr-repositories': [createRepository({ hasTaggedImageRetentionCap: null })],
      }),
    });
    const covered = ecrMissingTaggedImageRetentionCapRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ecr-repositories': [createRepository({ hasTaggedImageRetentionCap: true })],
      }),
    });

    expect(missingPolicy).toBeNull();
    expect(unknownCoverage).toBeNull();
    expect(covered).toBeNull();
  });
});
