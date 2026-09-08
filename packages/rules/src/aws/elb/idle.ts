import { createFinding, createFindingMatch, createLiveEvaluationCoverage, createRule } from '../../shared/helpers.js';
import type { AwsEc2LoadBalancer } from '../../shared/metadata.js';
import { getTargetCountByArn, hasNoRegisteredTargets } from './shared.js';

const RULE_ID = 'CLDBRN-AWS-ELB-5';
const RULE_SERVICE = 'elb';
const RULE_SEVERITY = 'medium' as const;
const RULE_MESSAGE = 'Load balancers with consistently low request volume should be reviewed for cleanup.';

const supportsHttpRequestActivity = (loadBalancer: AwsEc2LoadBalancer): boolean =>
  loadBalancer.loadBalancerType === 'application' ||
  (loadBalancer.loadBalancerType === 'classic' &&
    (loadBalancer.listenerProtocols?.length ?? 0) > 0 &&
    loadBalancer.listenerProtocols?.every((protocol) => protocol === 'HTTP' || protocol === 'HTTPS') === true);

/** Flag HTTP load balancers with low 14-day request activity unless a stricter empty-target rule covers them. */
export const elbIdleRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'Load Balancer Idle',
  description:
    'Flag Application Load Balancers and HTTP/HTTPS-only Classic Load Balancers whose 14-day average request count stays below 10 requests per day.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ec2-load-balancer-request-activity', 'aws-ec2-load-balancers', 'aws-ec2-target-groups'],
  getLiveEvaluationCoverage: ({ resources }) => {
    const activityByArn = new Map(
      resources.get('aws-ec2-load-balancer-request-activity').map((activity) => [activity.loadBalancerArn, activity]),
    );
    const targetCountByArn = getTargetCountByArn(resources.get('aws-ec2-target-groups'));

    return createLiveEvaluationCoverage(
      resources.get('aws-ec2-load-balancers'),
      (loadBalancer) => {
        const alreadyCoveredByCleanupRule =
          loadBalancer.loadBalancerType === 'classic'
            ? loadBalancer.instanceCount === 0
            : hasNoRegisteredTargets(loadBalancer, targetCountByArn);
        const activity = activityByArn.get(loadBalancer.loadBalancerArn);

        return (
          alreadyCoveredByCleanupRule ||
          (supportsHttpRequestActivity(loadBalancer) &&
            (activity?.requestActivityStatus === undefined || activity.requestActivityStatus === 'complete') &&
            activity?.averageRequestsPerDayLast14Days != null)
        );
      },
      (loadBalancer) => createFindingMatch(loadBalancer.loadBalancerArn, loadBalancer.region, loadBalancer.accountId),
    );
  },
  evaluateLive: ({ resources }) => {
    const loadBalancers = resources.get('aws-ec2-load-balancers');
    const targetCountByArn = getTargetCountByArn(resources.get('aws-ec2-target-groups'));
    const loadBalancerByArn = new Map(
      loadBalancers.map((loadBalancer) => [loadBalancer.loadBalancerArn, loadBalancer] as const),
    );
    const findings = resources
      .get('aws-ec2-load-balancer-request-activity')
      .filter(
        (activity) =>
          (activity.requestActivityStatus === undefined || activity.requestActivityStatus === 'complete') &&
          activity.averageRequestsPerDayLast14Days !== null &&
          activity.averageRequestsPerDayLast14Days < 10,
      )
      .flatMap((activity) => {
        const loadBalancer = loadBalancerByArn.get(activity.loadBalancerArn);

        if (!loadBalancer || !supportsHttpRequestActivity(loadBalancer)) {
          return [];
        }

        const alreadyCoveredByCleanupRule =
          loadBalancer.loadBalancerType === 'classic'
            ? loadBalancer.instanceCount === 0
            : hasNoRegisteredTargets(loadBalancer, targetCountByArn);

        return alreadyCoveredByCleanupRule
          ? []
          : [createFindingMatch(loadBalancer.loadBalancerArn, loadBalancer.region, loadBalancer.accountId)];
      });

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
