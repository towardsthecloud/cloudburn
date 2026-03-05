import type { Rule } from './metadata.js';

// Intent: provide lightweight helper utilities for authoring consistent rules.
// TODO(cloudburn): add rule ID validation and metadata lint helpers.
export const createRule = (rule: Rule): Rule => rule;

export const toRuleIds = (rules: Rule[]): string[] => rules.map((rule) => rule.id);
