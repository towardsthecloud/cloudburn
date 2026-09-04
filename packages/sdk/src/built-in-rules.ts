import { awsRules, azureRules, gcpRules } from '@cloudburn/rules';
import type { BuiltInRuleMetadata, Rule } from './types.js';

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

/** Stable metadata for all built-in CloudBurn rules, ordered by provider, service, and rule ID. */
export const builtInRuleMetadata: BuiltInRuleMetadata[] = listBuiltInRuleMetadata([
  ...awsRules,
  ...azureRules,
  ...gcpRules,
]);
