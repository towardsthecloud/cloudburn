import type { CloudBurnConfig, CloudBurnModeConfig } from '../types.js';
import { defaultConfig } from './defaults.js';
import { validateConfig } from './validate.js';

const mergeModeConfig = (baseConfig: CloudBurnModeConfig, overrides?: CloudBurnModeConfig): CloudBurnModeConfig => ({
  ...baseConfig,
  ...overrides,
  disabledRules: overrides?.disabledRules ?? baseConfig.disabledRules,
  enabledRules: overrides?.enabledRules ?? baseConfig.enabledRules,
  services: overrides?.services ?? baseConfig.services,
});

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
): CloudBurnConfig =>
  validateConfig({
    discovery: mergeModeConfig(baseConfig.discovery, config?.discovery),
    iac: mergeModeConfig(baseConfig.iac, config?.iac),
  });
