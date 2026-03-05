import type { CloudBurnConfig } from '../types.js';
import { mergeConfig } from './merge.js';

// Intent: load CloudBurn config from disk and normalize the structure.
// TODO(cloudburn): read .cloudburn.yml/.yaml files and validate schema.
export const loadConfig = async (_path?: string): Promise<CloudBurnConfig> => mergeConfig();
