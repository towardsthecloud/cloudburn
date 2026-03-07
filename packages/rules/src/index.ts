// Intent: expose rule packs, presets, and metadata contracts for SDK and users.
// TODO(cloudburn): publish stable docs for custom rule pack authoring.
export { awsRules } from './aws/index.js';
export { azureRules } from './azure/index.js';
export { gcpRules } from './gcp/index.js';
export { awsCorePreset } from './presets/aws-core.js';
export { createRule, toRuleIds } from './shared/helpers.js';
export type {
  AwsEbsVolume,
  AwsEbsVolumeDefinition,
  Finding,
  LiveEvaluationContext,
  ResourceLocation,
  Rule,
  ScanSource,
  StaticEvaluationContext,
} from './shared/metadata.js';
