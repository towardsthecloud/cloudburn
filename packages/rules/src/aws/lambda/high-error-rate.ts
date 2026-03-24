import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-LAMBDA-2';
const RULE_SERVICE = 'lambda';
const RULE_MESSAGE = 'Lambda functions should not sustain an error rate above 10% over the last 7 days.';
// Error-rate review requires complete 7-day totals and only flags functions above 10%.
const HIGH_ERROR_RATE_THRESHOLD = 0.1;

/** Flag Lambda functions whose recent error rate exceeds the review threshold. */
export const lambdaHighErrorRateRule = createRule({
  id: RULE_ID,
  name: 'Lambda Function High Error Rate',
  description: 'Flag Lambda functions whose 7-day error rate is greater than 10%.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-lambda-functions', 'aws-lambda-function-metrics'],
  evaluateLive: ({ resources }) => {
    const metricsByFunctionName = new Map(
      resources.get('aws-lambda-function-metrics').map((metric) => [metric.functionName, metric] as const),
    );

    const findings = resources
      .get('aws-lambda-functions')
      .filter((fn) => {
        const metric = metricsByFunctionName.get(fn.functionName);

        return (
          metric?.totalInvocationsLast7Days !== null &&
          metric?.totalInvocationsLast7Days !== undefined &&
          metric.totalInvocationsLast7Days > 0 &&
          metric.totalErrorsLast7Days !== null &&
          metric.totalErrorsLast7Days !== undefined &&
          metric.totalErrorsLast7Days / metric.totalInvocationsLast7Days > HIGH_ERROR_RATE_THRESHOLD
        );
      })
      .map((fn) => createFindingMatch(fn.functionName, fn.region, fn.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
