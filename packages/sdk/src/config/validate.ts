import { builtInRuleMetadata } from '../built-in-rules.js';
import type { CloudBurnConfig, CloudBurnModeConfig, ConfigOutputFormat, ScanSource } from '../types.js';

const supportedFormats = new Set<ConfigOutputFormat>(['json', 'table', 'text']);
const rulesById = new Map(builtInRuleMetadata.map((rule) => [rule.id, rule]));

const normalizeRuleList = (value?: string[]): string[] | undefined => value?.map((ruleId) => ruleId.trim());

const validateRuleList = (mode: ScanSource, fieldName: keyof CloudBurnModeConfig, value?: string[]): void => {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Config ${mode}.${String(fieldName)} must be an array of rule IDs.`);
  }

  for (const ruleId of value) {
    if (typeof ruleId !== 'string' || ruleId.trim().length === 0) {
      throw new Error(`Config ${mode}.${String(fieldName)} must contain non-empty rule IDs.`);
    }

    const normalizedRuleId = ruleId.trim();
    const rule = rulesById.get(normalizedRuleId);

    if (!rule) {
      throw new Error(`Unknown rule ID "${normalizedRuleId}" in ${mode}.${String(fieldName)}.`);
    }

    if (!rule.supports.includes(mode)) {
      throw new Error(`Rule "${normalizedRuleId}" does not support ${mode} mode.`);
    }
  }
};

const validateModeConfig = (mode: ScanSource, config: CloudBurnModeConfig): CloudBurnModeConfig => {
  validateRuleList(mode, 'enabledRules', config.enabledRules);
  validateRuleList(mode, 'disabledRules', config.disabledRules);

  if (config.format !== undefined && !supportedFormats.has(config.format)) {
    throw new Error(`Invalid format "${config.format}" in ${mode}.format.`);
  }

  const enabledRules = normalizeRuleList(config.enabledRules);
  const disabledRules = normalizeRuleList(config.disabledRules);

  if (enabledRules && disabledRules) {
    const disabledRuleIds = new Set(disabledRules);
    const conflictingRuleId = enabledRules.find((ruleId) => disabledRuleIds.has(ruleId));

    if (conflictingRuleId) {
      throw new Error(`Rule "${conflictingRuleId}" cannot appear in both enabled-rules and disabled-rules.`);
    }
  }

  return {
    disabledRules,
    enabledRules,
    format: config.format,
  };
};

/**
 * Validates the normalized CloudBurn config and returns a defensive copy.
 *
 * @param config - Config to validate.
 * @returns A validated config value safe for runtime use.
 */
export const validateConfig = (config: CloudBurnConfig): CloudBurnConfig => ({
  discovery: validateModeConfig('discovery', config.discovery),
  iac: validateModeConfig('iac', config.iac),
});
