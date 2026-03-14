// Intent: expose stable SDK API surface for scanners and integrators.
// TODO(cloudburn): stabilize API before first public release.
export { awsCorePreset } from '@cloudburn/rules';
export { builtInRuleMetadata } from './built-in-rules.js';
export { parseIaC } from './parsers/index.js';
export { assertValidAwsRegion } from './providers/aws/client.js';
export { isAwsDiscoveryErrorCode } from './providers/aws/errors.js';
export { CloudBurnClient } from './scanner.js';
export type {
  AwsDiscoveredResource,
  AwsDiscoveryCatalog,
  AwsDiscoveryInitialization,
  AwsDiscoveryRegion,
  AwsDiscoveryRegionStatus,
  AwsDiscoveryStatus,
  AwsDiscoveryTarget,
  AwsEbsVolume,
  AwsEc2Instance,
  AwsLambdaFunction,
  AwsRdsInstance,
  AwsSupportedResourceType,
  BuiltInRuleMetadata,
  CloudBurnConfig,
  CloudBurnModeConfig,
  CloudProvider,
  ConfigOutputFormat,
  Finding,
  FindingMatch,
  ProviderFindingGroup,
  RegisteredRules,
  Rule,
  RuleConfig,
  ScanDiagnostic,
  ScanResult,
  ScanSource,
  Source,
  SourceLocation,
} from './types.js';
