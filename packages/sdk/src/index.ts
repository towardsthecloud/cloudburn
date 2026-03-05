// Intent: expose stable SDK API surface for scanners and integrators.
// TODO(cloudburn): stabilize API before first public release.
export { awsCorePreset } from '@cloudburn/rules';
export { CloudBurnScanner } from './scanner.js';
export type {
  CloudBurnConfig,
  Finding,
  RegisteredRules,
  Rule,
  RuleConfig,
  ScanMode,
  ScanResult,
  Severity,
} from './types.js';
