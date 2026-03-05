import type { CloudBurnConfig } from '../types.js';
import { defaultConfig } from './defaults.js';

// Intent: merge caller-provided config into known defaults.
// TODO(cloudburn): implement deep merge with profile-aware precedence.
export const mergeConfig = (config?: Partial<CloudBurnConfig>): CloudBurnConfig => ({
  ...defaultConfig,
  ...config,
  profiles: {
    ...defaultConfig.profiles,
    ...(config?.profiles ?? {}),
  },
  rules: {
    ...defaultConfig.rules,
    ...(config?.rules ?? {}),
  },
  customRules: config?.customRules ?? defaultConfig.customRules,
  live: {
    ...defaultConfig.live,
    ...(config?.live ?? {}),
    tags: {
      ...defaultConfig.live.tags,
      ...(config?.live?.tags ?? {}),
    },
    regions: config?.live?.regions ?? defaultConfig.live.regions,
  },
});
