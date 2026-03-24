import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-RDS-5';
const RULE_SERVICE = 'rds';
const RULE_MESSAGE = 'RDS DB instances with low CPU utilization should be reviewed.';
// Review provisioned databases whose 30-day average CPU stays at or below 10%.
const LOW_CPU_THRESHOLD = 10;
const getInstanceKey = (accountId: string, region: string, dbInstanceIdentifier: string): string =>
  `${accountId}:${region}:${dbInstanceIdentifier}`;

/** Flag available RDS DB instances with sustained low CPU utilization. */
export const rdsLowCpuUtilizationRule = createRule({
  id: RULE_ID,
  name: 'RDS DB Instance Low CPU Utilization',
  description: 'Flag available RDS DB instances whose 30-day average CPU stays at or below 10%.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-rds-instances', 'aws-rds-instance-cpu-metrics'],
  evaluateLive: ({ resources }) => {
    const instancesById = new Map(
      resources
        .get('aws-rds-instances')
        .map(
          (instance) =>
            [getInstanceKey(instance.accountId, instance.region, instance.dbInstanceIdentifier), instance] as const,
        ),
    );

    const findings = resources
      .get('aws-rds-instance-cpu-metrics')
      .filter((metric) => {
        const instance = instancesById.get(
          getInstanceKey(metric.accountId, metric.region, metric.dbInstanceIdentifier),
        );

        return (
          instance?.dbInstanceStatus === 'available' &&
          metric.averageCpuUtilizationLast30Days !== null &&
          metric.averageCpuUtilizationLast30Days <= LOW_CPU_THRESHOLD
        );
      })
      .flatMap((metric) => {
        const instance = instancesById.get(
          getInstanceKey(metric.accountId, metric.region, metric.dbInstanceIdentifier),
        );

        return instance ? [createFindingMatch(instance.dbInstanceIdentifier, instance.region, instance.accountId)] : [];
      });

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
