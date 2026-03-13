import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-ECR-1';
const RULE_SERVICE = 'ecr';
const RULE_MESSAGE = 'ECR repositories should define lifecycle policies.';

/** Flag private ECR repositories that do not define a lifecycle policy. */
export const ecrMissingLifecyclePolicyRule = createRule({
  id: RULE_ID,
  name: 'ECR Repository Missing Lifecycle Policy',
  description: 'Flag ECR repositories that do not define a lifecycle policy.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['iac', 'discovery'],
  discoveryDependencies: ['aws-ecr-repositories'],
  staticDependencies: ['aws-ecr-repositories'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ecr-repositories')
      .filter((repository) => !repository.hasLifecyclePolicy)
      .map((repository) => createFindingMatch(repository.repositoryName, repository.region, repository.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-ecr-repositories')
      .filter((repository) => !repository.hasLifecyclePolicy)
      .map((repository) => createFindingMatch(repository.resourceId, undefined, undefined, repository.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
