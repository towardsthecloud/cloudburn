import { awsRules } from '../aws/index.js';
import { toRuleIds } from '../shared/helpers.js';

// Intent: define the default built-in AWS rule preset used by scanner entrypoints.
// TODO(cloudburn): introduce additional presets (strict, startup, production).
export const awsCorePreset = {
  id: 'aws-core',
  name: 'AWS Core',
  description: 'Default AWS rule preset for CloudBurn.',
  ruleIds: toRuleIds(awsRules),
};
