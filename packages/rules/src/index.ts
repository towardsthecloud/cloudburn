// Intent: expose rule packs, presets, and metadata contracts for SDK and users.
// TODO(cloudburn): publish stable docs for custom rule pack authoring.
export { awsRules } from './aws/index.js';
export { azureRules } from './azure/index.js';
export { gcpRules } from './gcp/index.js';
export { awsCorePreset } from './presets/aws-core.js';
export { createFinding, createRule, toRuleIds } from './shared/helpers.js';
export type {
  AwsDiscoveredResource,
  AwsDiscoveryCatalog,
  AwsEbsVolume,
  AwsLambdaFunction,
  AwsResourceProperty,
  CloudProvider,
  Finding,
  FindingMatch,
  IaCResource,
  LiveDiscoveryDefinition,
  LiveEvaluationContext,
  LiveHydratorKey,
  Rule,
  ScanSource,
  SourceLocation,
  StaticEvaluationContext,
} from './shared/metadata.js';
