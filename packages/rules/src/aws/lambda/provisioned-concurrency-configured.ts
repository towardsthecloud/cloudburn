import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-LAMBDA-5';
const RULE_SERVICE = 'lambda';
const RULE_MESSAGE = 'Lambda provisioned concurrency should be reviewed for steady low-latency demand.';

/** Flag explicit Lambda provisioned concurrency configuration. */
export const lambdaProvisionedConcurrencyConfiguredRule = createRule({
  id: RULE_ID,
  name: 'Lambda Provisioned Concurrency Configured',
  description: 'Flag explicit Lambda provisioned concurrency configuration for cost review.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['iac'],
  staticDependencies: ['aws-lambda-provisioned-concurrency'],
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-lambda-provisioned-concurrency')
      .filter((config) => config.provisionedConcurrentExecutions !== null && config.provisionedConcurrentExecutions > 0)
      .map((config) => createFindingMatch(config.resourceId, undefined, undefined, config.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
