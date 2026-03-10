import type { CloudBurnConfig, RuleConfig } from '../types.js';
import { defaultConfig } from './defaults.js';

const mergeRuleConfigMap = (
  baseRules: Record<string, RuleConfig>,
  overrides?: Record<string, RuleConfig>,
): Record<string, RuleConfig> => {
  const mergedRules: Record<string, RuleConfig> = { ...baseRules };

  for (const [ruleId, ruleConfig] of Object.entries(overrides ?? {})) {
    mergedRules[ruleId] = {
      ...(baseRules[ruleId] ?? {}),
      ...ruleConfig,
    };
  }

  return mergedRules;
};

const mergeProfiles = (
  baseProfiles: CloudBurnConfig['profiles'],
  overrides?: Partial<CloudBurnConfig>['profiles'],
): CloudBurnConfig['profiles'] => {
  const mergedProfiles: CloudBurnConfig['profiles'] = { ...baseProfiles };

  for (const [profileName, profileRules] of Object.entries(overrides ?? {})) {
    mergedProfiles[profileName] = mergeRuleConfigMap(baseProfiles[profileName] ?? {}, profileRules);
  }

  return mergedProfiles;
};

/**
 * Merges runtime config overrides onto a resolved base CloudBurn config.
 *
 * @param config - Optional runtime overrides.
 * @param baseConfig - Already-resolved config loaded from defaults or disk.
 * @returns The normalized effective config.
 */
export const mergeConfig = (
  config?: Partial<CloudBurnConfig>,
  baseConfig: CloudBurnConfig = defaultConfig,
): CloudBurnConfig => ({
  ...baseConfig,
  ...config,
  profiles: mergeProfiles(baseConfig.profiles, config?.profiles),
  rules: mergeRuleConfigMap(baseConfig.rules, config?.rules),
  customRules: config?.customRules ?? baseConfig.customRules,
});
