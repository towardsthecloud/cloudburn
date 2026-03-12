import type { CloudBurnConfig } from '../types.js';

// Intent: provide deterministic baseline configuration defaults.
// TODO(cloudburn): expand defaults as new config sections become supported.
export const defaultConfig: CloudBurnConfig = {
  discovery: {},
  iac: {},
};
