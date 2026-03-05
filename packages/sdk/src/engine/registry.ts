import { awsRules } from '@cloudburn/rules';
import type { CloudBurnConfig, RegisteredRules } from '../types.js';

// Intent: resolve active rule set from built-ins plus config toggles.
// TODO(cloudburn): include custom rule loading and enable/disable filtering.
export const buildRuleRegistry = (_config: CloudBurnConfig): RegisteredRules => ({
  activeRules: awsRules,
});
