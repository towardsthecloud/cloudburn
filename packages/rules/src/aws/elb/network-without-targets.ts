import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';
import { hasNoRegisteredTargets } from './shared.js';

const RULE_ID = 'CLDBRN-AWS-ELB-4';
const RULE_SERVICE = 'elb';
const RULE_MESSAGE = 'Network Load Balancers with no registered targets should be deleted.';

/** Flag NLBs that have no attached target groups or only empty target groups. */
export const elbNetworkWithoutTargetsRule = createRule({
  id: RULE_ID,
  name: 'Network Load Balancer Without Targets',
  description: 'Flag Network Load Balancers that have no attached target groups or no registered targets.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ec2-load-balancers', 'aws-ec2-target-groups'],
  evaluateLive: ({ resources }) => {
    const targetGroups = resources.get('aws-ec2-target-groups');
    const findings = resources
      .get('aws-ec2-load-balancers')
      .filter((loadBalancer) => loadBalancer.loadBalancerType === 'network')
      .filter((loadBalancer) => hasNoRegisteredTargets(loadBalancer, targetGroups))
      .map((loadBalancer) =>
        createFindingMatch(loadBalancer.loadBalancerArn, loadBalancer.region, loadBalancer.accountId),
      );

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
