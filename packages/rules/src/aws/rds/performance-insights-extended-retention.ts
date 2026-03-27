import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-RDS-8';
const RULE_SERVICE = 'rds';
const RULE_MESSAGE =
  'RDS Performance Insights should use the included 7-day retention unless longer retention is required.';

const hasExtendedRetention = (enabled: boolean | null | undefined, retention: number | null | undefined): boolean => {
  if (enabled !== true) {
    return false;
  }

  if (retention === null) {
    return false;
  }

  return (retention ?? 7) > 7;
};

/** Flag DB instances that enable Performance Insights retention beyond the included 7-day period. */
export const rdsPerformanceInsightsExtendedRetentionRule = createRule({
  id: RULE_ID,
  name: 'RDS Performance Insights Extended Retention',
  description: 'Flag DB instances that enable Performance Insights retention beyond the included 7-day period.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['iac'],
  staticDependencies: ['aws-rds-instances'],
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-rds-instances')
      .filter((instance) =>
        hasExtendedRetention(instance.performanceInsightsEnabled, instance.performanceInsightsRetentionPeriod),
      )
      .map((instance) => createFindingMatch(instance.resourceId, undefined, undefined, instance.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
