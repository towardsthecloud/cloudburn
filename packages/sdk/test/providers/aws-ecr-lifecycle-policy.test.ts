import { describe, expect, it } from 'vitest';
import { getEcrLifecyclePolicyTraits } from '../../src/providers/aws/resources/ecr-lifecycle-policy.js';

const taggedExpiryPolicy = (selection: Record<string, unknown>) => ({
  rules: [{ action: { type: 'expire' }, rulePriority: 1, selection: { tagStatus: 'tagged', ...selection } }],
});

describe('getEcrLifecyclePolicyTraits', () => {
  it.each([
    ['imageCountMoreThan', { countNumber: 10, countType: 'imageCountMoreThan', tagPrefixList: ['release'] }],
    ['sinceImagePushed', { countNumber: 90, countType: 'sinceImagePushed', countUnit: 'days', tagPrefixList: ['v'] }],
    [
      'sinceImagePulled',
      {
        countNumber: 90,
        countType: 'sinceImagePulled',
        countUnit: 'days',
        storageClass: 'standard',
        tagPrefixList: ['release'],
      },
    ],
    [
      'sinceImageTransitioned',
      {
        countNumber: 30,
        countType: 'sinceImageTransitioned',
        countUnit: 'days',
        storageClass: 'archive',
        tagPatternList: ['release-*'],
      },
    ],
  ])('recognizes %s as a tagged image retention cap', (_countType, selection) => {
    expect(getEcrLifecyclePolicyTraits(JSON.stringify(taggedExpiryPolicy(selection)))).toEqual({
      hasTaggedImageRetentionCap: true,
      hasUntaggedImageExpiry: false,
    });
  });

  it('recognizes CloudFormation-style capitalized keys for age-based retention caps', () => {
    expect(
      getEcrLifecyclePolicyTraits({
        Rules: [
          {
            Action: { Type: 'expire' },
            RulePriority: 1,
            Selection: { CountNumber: 14, CountType: 'sinceImagePulled', CountUnit: 'days', TagStatus: 'any' },
          },
        ],
      }),
    ).toEqual({ hasTaggedImageRetentionCap: true, hasUntaggedImageExpiry: true });
  });

  it('does not treat unsupported count types or non-positive counts as retention caps', () => {
    expect(
      getEcrLifecyclePolicyTraits(
        JSON.stringify(taggedExpiryPolicy({ countNumber: 0, countType: 'sinceImagePulled', countUnit: 'days' })),
      ),
    ).toEqual({ hasTaggedImageRetentionCap: false, hasUntaggedImageExpiry: false });
    expect(
      getEcrLifecyclePolicyTraits(JSON.stringify(taggedExpiryPolicy({ countNumber: 5, countType: 'unknownType' }))),
    ).toEqual({ hasTaggedImageRetentionCap: false, hasUntaggedImageExpiry: false });
  });

  it('returns unknown traits when the policy cannot be parsed', () => {
    expect(getEcrLifecyclePolicyTraits('{"rules":')).toEqual({
      hasTaggedImageRetentionCap: null,
      hasUntaggedImageExpiry: null,
    });
    expect(getEcrLifecyclePolicyTraits(undefined)).toEqual({
      hasTaggedImageRetentionCap: null,
      hasUntaggedImageExpiry: null,
    });
  });
});
