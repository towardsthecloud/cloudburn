import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';
import { hasNoRegisteredTargets } from './shared.js';

const RULE_ID = 'CLDBRN-AWS-ELB-5';
const RULE_SERVICE = 'elb';
const RULE_MESSAGE = 'Load balancers with consistently low request volume should be reviewed for cleanup.';

/** Flag load balancers with low 14-day request activity unless a stricter empty-target rule already covers them. */
export const elbIdleRule = createRule({
  id: RULE_ID,
  name: 'Load Balancer Idle',
  description: 'Flag load balancers whose 14-day average request count stays below 10 requests per day.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ec2-load-balancer-request-activity', 'aws-ec2-load-balancers', 'aws-ec2-target-groups'],
  evaluateLive: ({ resources }) => {
    const loadBalancers = resources.get('aws-ec2-load-balancers');
    const targetGroups = resources.get('aws-ec2-target-groups');
    const loadBalancerByArn = new Map(
      loadBalancers.map((loadBalancer) => [loadBalancer.loadBalancerArn, loadBalancer] as const),
    );
    const findings = resources
      .get('aws-ec2-load-balancer-request-activity')
      .filter(
        (activity) =>
          activity.averageRequestsPerDayLast14Days !== null && activity.averageRequestsPerDayLast14Days < 10,
      )
      .flatMap((activity) => {
        const loadBalancer = loadBalancerByArn.get(activity.loadBalancerArn);

        if (!loadBalancer) {
          return [];
        }

        const alreadyCoveredByCleanupRule =
          loadBalancer.loadBalancerType === 'classic'
            ? loadBalancer.instanceCount === 0
            : hasNoRegisteredTargets(loadBalancer, targetGroups);

        return alreadyCoveredByCleanupRule
          ? []
          : [createFindingMatch(loadBalancer.loadBalancerArn, loadBalancer.region, loadBalancer.accountId)];
      });

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
