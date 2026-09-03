import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-ECR-2';
const RULE_SERVICE = 'ecr';
const RULE_SEVERITY = 'low' as const;
const RULE_MESSAGE = 'ECR repositories should expire untagged images.';

/** Flag ECR repositories whose lifecycle policy does not expire untagged images. */
export const ecrMissingUntaggedImageExpiryRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'ECR Lifecycle Policy Missing Untagged Image Expiry',
  description: 'Flag ECR repositories whose lifecycle policy does not expire untagged images.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['iac', 'discovery'],
  discoveryDependencies: ['aws-ecr-repositories'],
  staticDependencies: ['aws-ecr-repositories'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ecr-repositories')
      .filter((repository) => repository.hasLifecyclePolicy && repository.hasUntaggedImageExpiry === false)
      .map((repository) => createFindingMatch(repository.repositoryName, repository.region, repository.accountId));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-ecr-repositories')
      .filter((repository) => repository.hasLifecyclePolicy && repository.hasUntaggedImageExpiry === false)
      .map((repository) => createFindingMatch(repository.resourceId, undefined, undefined, repository.location));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'iac',
      findings,
    );
  },
});
