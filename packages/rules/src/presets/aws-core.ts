import { awsRules } from '../aws/index.js';
import { type AwsCapability, getAwsRuleCapabilities } from '../shared/capabilities.js';
import { toRuleIds } from '../shared/helpers.js';

const awsCoreOptInCapabilities = new Set<AwsCapability>([
  'cost-optimization-hub-enrollment',
  'compute-optimizer-enrollment',
  'resource-explorer-aggregator',
]);

// Intent: define the default built-in AWS rule preset used by scanner entrypoints.
// TODO(cloudburn): introduce additional presets (strict, startup, production).
export const awsCorePreset = {
  id: 'aws-core',
  name: 'AWS Core',
  description: 'Default AWS rule preset for CloudBurn, excluding rules that require explicit AWS setup.',
  ruleIds: toRuleIds(
    awsRules.filter(
      (rule) => !getAwsRuleCapabilities(rule).some((capability) => awsCoreOptInCapabilities.has(capability)),
    ),
  ),
};
