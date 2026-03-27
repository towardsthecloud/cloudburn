import { describe, expect, it } from 'vitest';
import { ecrMissingTaggedImageRetentionCapRule } from '../src/aws/ecr/missing-tagged-image-retention-cap.js';
import type { AwsStaticEcrRepository } from '../src/index.js';
import { StaticResourceBag } from '../src/index.js';

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
