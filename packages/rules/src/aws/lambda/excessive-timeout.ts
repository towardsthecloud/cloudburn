import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-LAMBDA-3';
const RULE_SERVICE = 'lambda';
const RULE_MESSAGE = 'Lambda functions should not keep timeouts far above their observed average duration.';
// Review only generously configured functions whose timeout is at least 30s and 5x the observed average duration.
const MIN_TIMEOUT_REVIEW_SECONDS = 30;
const EXCESSIVE_TIMEOUT_RATIO = 5;

/** Flag Lambda functions whose configured timeout far exceeds observed average execution time. */
export const lambdaExcessiveTimeoutRule = createRule({
  id: RULE_ID,
  name: 'Lambda Function Excessive Timeout',
  description:
    'Flag Lambda functions whose configured timeout is at least 30 seconds and 5x their 7-day average duration.',
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
          fn.timeoutSeconds >= MIN_TIMEOUT_REVIEW_SECONDS &&
          metric?.averageDurationMsLast7Days !== null &&
          metric?.averageDurationMsLast7Days !== undefined &&
          metric.averageDurationMsLast7Days > 0 &&
          fn.timeoutSeconds * 1000 >= metric.averageDurationMsLast7Days * EXCESSIVE_TIMEOUT_RATIO
        );
      })
      .map((fn) => createFindingMatch(fn.functionName, fn.region, fn.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
