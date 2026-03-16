import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-ELB-2';
const RULE_SERVICE = 'elb';
const RULE_MESSAGE = 'Classic Load Balancers with no attached instances should be deleted.';

/** Flag Classic Load Balancers that are not serving any instances. */
export const elbClassicWithoutInstancesRule = createRule({
  id: RULE_ID,
  name: 'Classic Load Balancer Without Instances',
  description: 'Flag Classic Load Balancers that have zero attached instances.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ec2-load-balancers'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ec2-load-balancers')
      .filter((loadBalancer) => loadBalancer.loadBalancerType === 'classic' && loadBalancer.instanceCount === 0)
      .map((loadBalancer) =>
        createFindingMatch(loadBalancer.loadBalancerArn, loadBalancer.region, loadBalancer.accountId),
      );

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
