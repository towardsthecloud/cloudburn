import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-APIGATEWAY-1';
const RULE_SERVICE = 'apigateway';
const RULE_MESSAGE = 'API Gateway REST API stages should enable caching when stage caching is available.';

/** Flag API Gateway REST API stages whose cache cluster is disabled. */
export const apiGatewayCachingDisabledRule = createRule({
  id: RULE_ID,
  name: 'API Gateway Stage Caching Disabled',
  description: 'Flag API Gateway REST API stages with caching disabled.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery', 'iac'],
  discoveryDependencies: ['aws-apigateway-stages'],
  staticDependencies: ['aws-apigateway-stages'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-apigateway-stages')
      .filter((stage) => stage.cacheClusterEnabled !== true)
      .map((stage) => createFindingMatch(stage.stageArn, stage.region, stage.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-apigateway-stages')
      .filter((stage) => stage.cacheClusterEnabled === false)
      .map((stage) => createFindingMatch(stage.resourceId, undefined, undefined, stage.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
