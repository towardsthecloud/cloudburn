import type { CloudBurnConfig } from '../types.js';

// Intent: provide deterministic baseline configuration defaults.
// TODO(cloudburn): expand defaults for profile inheritance and live-scan behavior.
export const defaultConfig: CloudBurnConfig = {
  version: 1,
  profile: 'dev',
  profiles: {},
  rules: {},
  customRules: [],
  live: {
    tags: {},
    regions: [],
  },
};
