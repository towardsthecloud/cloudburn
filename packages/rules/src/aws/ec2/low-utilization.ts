import {
  createFinding,
  createFindingMatch,
  createLiveEvaluationCoverage,
  createRule,
  getAwsResourceScopeKey,
} from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EC2-5';
const RULE_SERVICE = 'ec2';
const RULE_SEVERITY = 'high' as const;
const RULE_MESSAGE = 'EC2 instances should not remain low utilization for 4 or more of the previous 14 days.';

/** Flag EC2 instances that match the low-utilization heuristic. */
export const ec2LowUtilizationRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'EC2 Instance Low Utilization',
  description:
    'Flag EC2 instances whose CPU and network usage stay below the low-utilization threshold for at least 4 of the previous 14 days.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ec2-instances', 'aws-ec2-instance-utilization'],
  getLiveEvaluationCoverage: ({ resources }) => {
    const metricsByInstance = new Map(
      resources
        .get('aws-ec2-instance-utilization')
        .map((metric) => [getAwsResourceScopeKey(metric.accountId, metric.region, metric.instanceId), metric] as const),
    );

    return createLiveEvaluationCoverage(
      resources.get('aws-ec2-instances'),
      (instance) => {
        const metric = metricsByInstance.get(
          getAwsResourceScopeKey(instance.accountId, instance.region, instance.instanceId),
        );

        return metric !== undefined && (metric.lowUtilizationDays >= 4 || metric.observedDays === 14);
      },
      (instance) => createFindingMatch(instance.instanceId, instance.region, instance.accountId),
    );
  },
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ec2-instance-utilization')
      .filter((instance) => instance.lowUtilizationDays >= 4)
      .map((instance) => createFindingMatch(instance.instanceId, instance.region, instance.accountId));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
