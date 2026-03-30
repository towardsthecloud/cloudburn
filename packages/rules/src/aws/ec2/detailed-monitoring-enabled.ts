import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EC2-10';
const RULE_SERVICE = 'ec2';
const RULE_MESSAGE = 'EC2 instances should review detailed monitoring because it adds CloudWatch cost.';

/** Flag EC2 instances that explicitly enable detailed monitoring. */
export const ec2DetailedMonitoringEnabledRule = createRule({
  id: RULE_ID,
  name: 'EC2 Instance Detailed Monitoring Enabled',
  description: 'Flag EC2 instances that explicitly enable detailed monitoring.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['iac'],
  staticDependencies: ['aws-ec2-instances'],
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-ec2-instances')
      .filter((instance) => instance.detailedMonitoringEnabled)
      .map((instance) => createFindingMatch(instance.resourceId, undefined, undefined, instance.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
