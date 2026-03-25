import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-LAMBDA-4';
const RULE_SERVICE = 'lambda';
const RULE_MESSAGE = 'Lambda functions should not keep memory far above their observed execution needs.';
const MIN_MEMORY_REVIEW_MB = 256;
const MAX_DURATION_TO_TIMEOUT_RATIO = 0.3;

const getFunctionKey = (accountId: string, region: string, functionName: string): string =>
  `${accountId}:${region}:${functionName}`;

/** Flag Lambda functions whose configured memory stays well above observed execution needs. */
export const lambdaMemoryOverprovisioningRule = createRule({
  id: RULE_ID,
  name: 'Lambda Function Memory Overprovisioned',
  description:
    'Flag Lambda functions above 256 MB whose observed 7-day average duration uses less than 30% of the configured timeout.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-lambda-functions', 'aws-lambda-function-metrics'],
  evaluateLive: ({ resources }) => {
    const metricsByFunctionKey = new Map(
      resources
        .get('aws-lambda-function-metrics')
        .map((metric) => [getFunctionKey(metric.accountId, metric.region, metric.functionName), metric] as const),
    );

    const findings = resources
      .get('aws-lambda-functions')
      .filter((fn) => {
        if (fn.memorySizeMb <= MIN_MEMORY_REVIEW_MB) {
          return false;
        }

        const metric = metricsByFunctionKey.get(getFunctionKey(fn.accountId, fn.region, fn.functionName));

        return (
          metric?.totalInvocationsLast7Days !== null &&
          metric?.totalInvocationsLast7Days !== undefined &&
          metric.totalInvocationsLast7Days > 0 &&
          metric.averageDurationMsLast7Days !== null &&
          metric.averageDurationMsLast7Days !== undefined &&
          metric.averageDurationMsLast7Days < fn.timeoutSeconds * 1000 * MAX_DURATION_TO_TIMEOUT_RATIO
        );
      })
      .map((fn) => createFindingMatch(fn.functionName, fn.region, fn.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
