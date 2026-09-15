import { awsRules, azureRules, gcpRules, getAwsRuleCapabilities } from '@cloudburn/rules';
import type { AwsCapability, BuiltInRuleMetadata, Rule } from './types.js';

/**
 * Projects a built-in rule into the serializable metadata exposed by SDK discovery results.
 *
 * @param rule - Built-in rule whose generic metadata should be exposed.
 * @returns The rule metadata without executable evaluation functions.
 */
export const toBuiltInRuleMetadata = ({
  description,
  id,
  message,
  name,
  provider,
  service,
  severity,
  supports,
  supersedesRuleIds,
}: Rule): BuiltInRuleMetadata => ({
  description,
  id,
  message,
  name,
  provider,
  service,
  severity,
  supports: [...supports],
  ...(supersedesRuleIds ? { supersedesRuleIds: [...supersedesRuleIds] } : {}),
});

const compareBuiltInRules = (left: BuiltInRuleMetadata, right: BuiltInRuleMetadata): number =>
  left.provider.localeCompare(right.provider) ||
  left.service.localeCompare(right.service) ||
  left.id.localeCompare(right.id, undefined, { numeric: true });

/**
 * Projects built-in rules into a serializable metadata view and sorts them for stable CLI output.
 *
 * @param rules - Built-in rules to expose through the SDK metadata surface.
 * @returns Built-in rule metadata ordered by provider, service, and numeric rule suffix.
 */
export const listBuiltInRuleMetadata = (rules: Rule[]): BuiltInRuleMetadata[] =>
  rules.map(toBuiltInRuleMetadata).sort(compareBuiltInRules);

const builtInRules: Rule[] = [...awsRules, ...azureRules, ...gcpRules];

/** Stable metadata for all built-in CloudBurn rules, ordered by provider, service, and rule ID. */
export const builtInRuleMetadata: BuiltInRuleMetadata[] = listBuiltInRuleMetadata(builtInRules);

/**
 * Lists the AWS capabilities a built-in rule directly requires for live discovery.
 *
 * Performs no I/O and reads no AWS configuration; it projects pure rule metadata.
 * Only required `discoveryDependencies` contribute — optional supporting evidence
 * never appears as a direct capability. Rules without gated datasets, including
 * IaC-only rules, return an empty list. Each call returns a fresh, alphabetically
 * sorted array that callers may mutate safely.
 *
 * @param ruleId - Built-in rule ID to inspect.
 * @returns Sorted unique AWS capabilities required by the rule.
 * @throws Error when `ruleId` does not identify a built-in rule.
 */
export const getRuleCapabilities = (ruleId: string): AwsCapability[] => {
  const rule = builtInRules.find((candidate) => candidate.id === ruleId);
  if (!rule) throw new Error(`Unknown built-in rule '${ruleId}'.`);
  return getAwsRuleCapabilities(rule);
};
