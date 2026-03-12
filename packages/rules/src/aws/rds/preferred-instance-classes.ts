import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';
import { getAwsRdsPreferredInstanceFamilyState } from './preferred-instance-families.js';

const RULE_ID = 'CLDBRN-AWS-RDS-1';
const RULE_SERVICE = 'rds';
const RULE_MESSAGE = 'RDS DB instances should use preferred instance classes.';

const getPreferredInstanceState = (instanceClass: string | null): 'preferred' | 'non-preferred' | 'unclassified' => {
  if (instanceClass === null) {
    return 'unclassified';
  }

  return getAwsRdsPreferredInstanceFamilyState(instanceClass);
};

/** Flag RDS DB instances that do not use the curated preferred instance-class families. */
export const rdsPreferredInstanceClassRule = createRule({
  id: RULE_ID,
  name: 'RDS Instance Class Not Preferred',
  description: 'Flag RDS DB instances that do not use curated preferred instance classes.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['iac'],
  staticDependencies: ['aws-rds-instances'],
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-rds-instances')
      .filter((instance) => getPreferredInstanceState(instance.instanceClass) === 'non-preferred')
      .map((instance) => createFindingMatch(instance.resourceId, undefined, undefined, instance.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
