import { createFinding, createFindingMatch, createLiveEvaluationCoverage, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-TAGGING-1';
const RULE_SERVICE = 'tagging';
const RULE_SEVERITY = 'low' as const;
const RULE_MESSAGE = 'Taggable AWS resources should have at least one user-created tag.';

/** Flag untagged user-created AWS resources whose creation origin can be assessed. */
export const taggingUntaggedResourcesRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'AWS Resource Untagged',
  description: 'Flag untagged user-created AWS resources, excluding built-in defaults and service-managed resources.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-resource-explorer-untagged-resources'],
  getLiveEvaluationCoverage: ({ resources }) =>
    createLiveEvaluationCoverage(
      resources.get('aws-resource-explorer-untagged-resources'),
      (resource) => resource.creationOrigin !== 'unknown',
      (resource) => createFindingMatch(resource.arn, resource.region, resource.accountId),
    ),
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-resource-explorer-untagged-resources')
      .filter((resource) => resource.creationOrigin !== 'unknown')
      .map((resource) => createFindingMatch(resource.arn, resource.region, resource.accountId));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
