import { awsRules, azureRules, gcpRules } from '@cloudburn/rules';
import type { BuiltInRuleMetadata, Rule } from './types.js';

const toBuiltInRuleMetadata = ({ description, id, name, provider, service, supports }: Rule): BuiltInRuleMetadata => ({
  description,
  id,
  name,
  provider,
  service,
  supports: [...supports],
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
