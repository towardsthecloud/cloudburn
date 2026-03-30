import { describe, expect, it } from 'vitest';
import { ecrMissingUntaggedImageExpiryRule } from '../src/aws/ecr/missing-untagged-image-expiry.js';
import type { AwsStaticEcrRepository } from '../src/index.js';
import { StaticResourceBag } from '../src/index.js';

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
