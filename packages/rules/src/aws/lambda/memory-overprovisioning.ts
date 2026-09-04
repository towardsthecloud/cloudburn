import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-LAMBDA-4';
const RULE_SERVICE = 'lambda';
const RULE_SEVERITY = 'medium' as const;
const RULE_MESSAGE = 'Lambda functions should not keep memory far above their observed execution needs.';

/** Flag Lambda functions that AWS Compute Optimizer identifies as memory-overprovisioned. */
export const lambdaMemoryOverprovisioningRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'Lambda Function Memory Overprovisioned',
  description: 'Flag Lambda functions that AWS Compute Optimizer identifies as memory-overprovisioned.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-lambda-functions', 'aws-lambda-memory-recommendations'],
  supersedesRuleIds: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-4'],
  evaluateLive: ({ resources }) => {
    const findings = resources.get('aws-lambda-memory-recommendations').map((recommendation) => ({
      ...createFindingMatch(recommendation.functionArn, recommendation.region, recommendation.accountId),
      resourceType: 'lambda:function',
    }));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
