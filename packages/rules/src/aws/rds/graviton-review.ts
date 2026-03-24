import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';
import { isAwsRdsGravitonFamily, shouldReviewAwsRdsInstanceClassForGraviton } from './preferred-instance-families.js';

const RULE_ID = 'CLDBRN-AWS-RDS-4';
const RULE_SERVICE = 'rds';
const RULE_MESSAGE = 'RDS DB instances without a Graviton equivalent in use should be reviewed.';

/** Flag RDS DB instances still using reviewable non-Graviton families. */
export const rdsGravitonReviewRule = createRule({
  id: RULE_ID,
  name: 'RDS DB Instance Without Graviton',
  description:
    'Flag RDS DB instances that still use non-Graviton instance families when a clear Graviton-based equivalent exists.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-rds-instances'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-rds-instances')
      .filter(
        (instance) =>
          !isAwsRdsGravitonFamily(instance.instanceClass) &&
          shouldReviewAwsRdsInstanceClassForGraviton(instance.instanceClass),
      )
      .map((instance) => createFindingMatch(instance.dbInstanceIdentifier, instance.region, instance.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
