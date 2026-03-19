import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';
import { getAwsEc2PreferredInstanceFamilyState } from '../ec2/preferred-instance-families.js';

const RULE_ID = 'CLDBRN-AWS-EMR-1';
const RULE_SERVICE = 'emr';
const RULE_MESSAGE = 'EMR clusters using previous-generation instance types should be reviewed.';

/** Flag EMR clusters that still rely on previous-generation EC2 instance types. */
export const emrPreviousGenerationInstanceTypeRule = createRule({
  id: RULE_ID,
  name: 'EMR Cluster Previous Generation Instance Types',
  description: 'Flag EMR clusters that still use previous-generation EC2 instance types.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-emr-clusters'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-emr-clusters')
      .filter(
        (cluster) =>
          // Ended clusters are historical and no longer actionable for instance-family review.
          cluster.endDateTime === undefined &&
          cluster.instanceTypes.some(
            (instanceType) => getAwsEc2PreferredInstanceFamilyState(instanceType) === 'non-preferred',
          ),
      )
      .map((cluster) => createFindingMatch(cluster.clusterId, cluster.region, cluster.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
