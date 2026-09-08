import { createFinding, createFindingMatch, createLiveEvaluationCoverage, createRule } from '../../shared/helpers.js';
import type { AwsLambdaMemoryRecommendation, FindingMatch } from '../../shared/metadata.js';

const RULE_ID = 'CLDBRN-AWS-LAMBDA-4';
const RULE_SERVICE = 'lambda';
const RULE_SEVERITY = 'medium' as const;
const RULE_MESSAGE = 'Lambda functions should not keep memory far above their observed execution needs.';
const LAMBDA_FUNCTION_RESOURCE_TYPE = 'lambda:function';

const toFunctionMatch = (functionArn: string, region: string, accountId: string): FindingMatch => ({
  ...createFindingMatch(functionArn, region, accountId),
  resourceType: LAMBDA_FUNCTION_RESOURCE_TYPE,
});

const toRecommendationsByFunctionArn = (
  recommendations: readonly AwsLambdaMemoryRecommendation[],
): Map<string, AwsLambdaMemoryRecommendation> =>
  new Map(recommendations.map((recommendation) => [recommendation.functionArn, recommendation] as const));

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
  // A function is assessed only when Compute Optimizer returned a usable memory result for it. Functions that are
  // absent from the recommendation dataset, or returned without a finding, remain unknown.
  getLiveEvaluationCoverage: ({ resources }) => {
    const recommendationsByFunctionArn = toRecommendationsByFunctionArn(
      resources.get('aws-lambda-memory-recommendations'),
    );

    return createLiveEvaluationCoverage(
      resources.get('aws-lambda-functions'),
      (fn) => {
        const assessment = fn.functionArn ? recommendationsByFunctionArn.get(fn.functionArn)?.assessment : undefined;
        return assessment !== undefined && assessment !== 'unavailable';
      },
      (fn) => toFunctionMatch(fn.functionArn ?? fn.functionName, fn.region, fn.accountId),
    );
  },
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-lambda-memory-recommendations')
      .filter((recommendation) => recommendation.assessment === 'memory_overprovisioned')
      .map((recommendation) => ({
        ...toFunctionMatch(recommendation.functionArn, recommendation.region, recommendation.accountId),
        actionType: 'Rightsize',
      }));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
