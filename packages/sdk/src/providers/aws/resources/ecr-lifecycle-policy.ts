import { isRecord } from '@cloudburn/rules';
import { getLiteralNumberish, getLiteralString } from '../literal-values.js';

/** Normalized ECR lifecycle-policy traits used by static and live repository datasets. */
export type EcrLifecyclePolicyTraits = {
  hasTaggedImageRetentionCap: boolean | null;
  hasUntaggedImageExpiry: boolean | null;
};

const parsePolicy = (value: unknown): Record<string, unknown> | null => {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Parse an ECR lifecycle policy into the traits consumed by repository rules.
 *
 * @param policyText - Parsed policy data or its JSON representation.
 * @returns Normalized policy traits, or unknown traits when the policy cannot be parsed.
 */
export const getEcrLifecyclePolicyTraits = (policyText: unknown): EcrLifecyclePolicyTraits => {
  const policy = parsePolicy(policyText);

  if (!policy) {
    return {
      hasTaggedImageRetentionCap: null,
      hasUntaggedImageExpiry: null,
    };
  }

  const candidateRules = policy.rules ?? policy.Rules;
  const rules = Array.isArray(candidateRules) ? candidateRules.filter(isRecord) : [];
  let hasTaggedImageRetentionCap = false;
  let hasUntaggedImageExpiry = false;

  for (const rule of rules) {
    const selection = isRecord(rule.selection) ? rule.selection : isRecord(rule.Selection) ? rule.Selection : null;
    const action = isRecord(rule.action) ? rule.action : isRecord(rule.Action) ? rule.Action : null;

    if (!selection || !action) {
      continue;
    }

    const tagStatus = getLiteralString(selection.tagStatus ?? selection.TagStatus);
    const actionType = getLiteralString(action.type ?? action.Type);

    if (actionType !== 'expire') {
      continue;
    }

    if (tagStatus === 'untagged' || tagStatus === 'any') {
      hasUntaggedImageExpiry = true;
    }

    if (tagStatus === 'tagged' || tagStatus === 'any') {
      const countType = getLiteralString(selection.countType ?? selection.CountType);
      const countNumber = getLiteralNumberish(selection.countNumber ?? selection.CountNumber);

      if (
        (countType === 'imagecountmorethan' || countType === 'sinceimagepushed') &&
        countNumber !== null &&
        countNumber > 0
      ) {
        hasTaggedImageRetentionCap = true;
      }
    }
  }

  return {
    hasTaggedImageRetentionCap,
    hasUntaggedImageExpiry,
  };
};
