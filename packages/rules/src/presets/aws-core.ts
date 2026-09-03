import { awsRules } from '../aws/index.js';
import { toRuleIds } from '../shared/helpers.js';

const awsCoreOptInRuleIds = new Set(['CLDBRN-AWS-LAMBDA-4', 'CLDBRN-AWS-TAGGING-1']);

// Intent: define the default built-in AWS rule preset used by scanner entrypoints.
// TODO(cloudburn): introduce additional presets (strict, startup, production).
export const awsCorePreset = {
  id: 'aws-core',
  name: 'AWS Core',
  description: 'Default AWS rule preset for CloudBurn, excluding rules that require explicit AWS setup.',
  ruleIds: toRuleIds(awsRules).filter((ruleId) => !awsCoreOptInRuleIds.has(ruleId)),
};
