import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-ECR-3';
const RULE_SERVICE = 'ecr';
const RULE_MESSAGE = 'ECR repositories should cap tagged image retention.';

/** Flag ECR repositories whose statically parsed lifecycle policy does not cap tagged image retention. */
export const ecrMissingTaggedImageRetentionCapRule = createRule({
  id: RULE_ID,
  name: 'ECR Lifecycle Policy Missing Tagged Image Retention Cap',
  description: 'Flag ECR repositories whose lifecycle policy does not cap tagged image retention.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['iac'],
  staticDependencies: ['aws-ecr-repositories'],
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-ecr-repositories')
      .filter((repository) => repository.hasLifecyclePolicy && repository.hasTaggedImageRetentionCap === false)
      .map((repository) => createFindingMatch(repository.resourceId, undefined, undefined, repository.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
