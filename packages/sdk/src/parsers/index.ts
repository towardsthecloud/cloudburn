// Intent: expose parser entrypoints behind a stable SDK surface.
// TODO(cloudburn): add parser auto-detection by file extension and template structure.
export { parseCloudFormation } from './cloudformation.js';
export { parseTerraform } from './terraform.js';
export type { IaCResource } from './types.js';
