import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-TAGGING-1';
const RULE_SERVICE = 'tagging';
const RULE_SEVERITY = 'low' as const;
const RULE_MESSAGE = 'Taggable AWS resources should have at least one user-created tag.';

/** Flag taggable AWS resources that Resource Explorer reports without user-created tags. */
export const taggingUntaggedResourcesRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'AWS Resource Untagged',
  description: 'Flag taggable AWS resources that have no user-created tags.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-resource-explorer-untagged-resources'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-resource-explorer-untagged-resources')
      .map((resource) => createFindingMatch(resource.arn, resource.region, resource.accountId));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
