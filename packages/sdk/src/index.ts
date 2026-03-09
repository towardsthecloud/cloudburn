// Intent: expose stable SDK API surface for scanners and integrators.
// TODO(cloudburn): stabilize API before first public release.
export { awsCorePreset } from '@cloudburn/rules';
export { parseIaC } from './parsers/index.js';
export { CloudBurnScanner } from './scanner.js';
export type {
  CloudBurnConfig,
  CloudProvider,
  Finding,
  FindingMatch,
  ProviderFindingGroup,
  RegisteredRules,
  Rule,
  RuleConfig,
  ScanResult,
  ScanSource,
  SourceLocation,
} from './types.js';
