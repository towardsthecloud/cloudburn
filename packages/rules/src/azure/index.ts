import type { Rule } from '../shared/metadata.js';

// Intent: reserve Azure provider namespace for future community and core rules.
// TODO(cloudburn): add first-party Azure optimization rules after AWS maturity.
export const azureRules: Rule[] = [];
