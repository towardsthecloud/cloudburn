import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-SAGEMAKER-2';
const RULE_SERVICE = 'sagemaker';
const RULE_MESSAGE =
  'SageMaker endpoints in service with zero invocations over 14 days should be reviewed for cleanup.';

const DAY_MS = 24 * 60 * 60 * 1000;
const ENDPOINT_IDLE_WINDOW_DAYS = 14;

/** Flag SageMaker endpoints that are in service, old enough, and idle for 14 days. */
export const sagemakerIdleEndpointRule = createRule({
  id: RULE_ID,
  name: 'SageMaker Endpoint Idle',
  description: 'Flag SageMaker endpoints in service whose 14-day invocation total is zero.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-sagemaker-endpoint-activity'],
  evaluateLive: ({ resources }) => {
    const cutoff = Date.now() - ENDPOINT_IDLE_WINDOW_DAYS * DAY_MS;
    const findings = resources
      .get('aws-sagemaker-endpoint-activity')
      .filter((endpoint) => {
        if (
          endpoint.endpointStatus !== 'InService' ||
          endpoint.totalInvocationsLast14Days !== 0 ||
          !endpoint.creationTime
        ) {
          return false;
        }

        const creationTime = Date.parse(endpoint.creationTime);

        return Number.isFinite(creationTime) && creationTime <= cutoff;
      })
      .map((endpoint) => createFindingMatch(endpoint.endpointName, endpoint.region, endpoint.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
