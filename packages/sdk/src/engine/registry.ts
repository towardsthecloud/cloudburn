import { awsRules } from '@cloudburn/rules';
import type { CloudBurnConfig, RegisteredRules, Source } from '../types.js';

// Intent: resolve active rule set from built-ins plus config toggles.
// TODO(cloudburn): include custom rule loading once the SDK supports custom modules.
export const buildRuleRegistry = (config: CloudBurnConfig, mode: Source): RegisteredRules => {
  const modeConfig = config[mode];
  const enabledRules = modeConfig.enabledRules ? new Set(modeConfig.enabledRules) : undefined;
  const disabledRules = modeConfig.disabledRules ? new Set(modeConfig.disabledRules) : undefined;
  const services = modeConfig.services ? new Set(modeConfig.services) : undefined;

  return {
    activeRules: awsRules.filter((rule) => {
      if (!rule.supports.includes(mode)) {
        return false;
      }

      if (services && !services.has(rule.service)) {
        return false;
      }

      if (enabledRules && !enabledRules.has(rule.id)) {
        return false;
      }

      return !disabledRules?.has(rule.id);
    }),
  };
};
