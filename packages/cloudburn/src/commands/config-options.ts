import { InvalidArgumentError } from 'commander';

/**
 * Parses a comma-separated list of rule IDs from a CLI flag.
 *
 * @param value - Raw CLI flag value.
 * @returns Normalized rule IDs in declaration order.
 */
export const parseRuleIdList = (value: string): string[] => {
  const ruleIds = value
    .split(',')
    .map((ruleId) => ruleId.trim())
    .filter((ruleId) => ruleId.length > 0);

  if (ruleIds.length === 0) {
    throw new InvalidArgumentError('Provide at least one rule ID.');
  }

  return ruleIds;
};
