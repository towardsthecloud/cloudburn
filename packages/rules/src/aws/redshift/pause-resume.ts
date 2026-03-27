import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-REDSHIFT-3';
const RULE_SERVICE = 'redshift';
const RULE_MESSAGE = 'Redshift clusters should enable both pause and resume schedules when eligible.';

const isPauseResumeEligible = (cluster: {
  automatedSnapshotRetentionPeriod?: number;
  clusterStatus?: string;
  hsmEnabled: boolean;
  pauseResumeStateAvailable?: boolean;
  multiAz?: string;
  vpcId?: string;
}): boolean =>
  // Pause/resume requires an available VPC-backed cluster, known automated snapshots, no HSM, and no Multi-AZ deployment.
  cluster.pauseResumeStateAvailable !== false &&
  cluster.clusterStatus === 'available' &&
  (cluster.automatedSnapshotRetentionPeriod ?? 0) > 0 &&
  !cluster.hsmEnabled &&
  cluster.multiAz?.toLowerCase() !== 'enabled' &&
  cluster.vpcId !== undefined;

const isStaticPauseResumeEligible = (cluster: {
  automatedSnapshotRetentionPeriod?: number | null;
  hasVpc: boolean;
  hsmEnabled: boolean | null;
  multiAz: boolean | null;
}): boolean =>
  (cluster.automatedSnapshotRetentionPeriod ?? 0) > 0 &&
  cluster.hasVpc &&
  cluster.hsmEnabled !== true &&
  cluster.multiAz !== true;

/** Flag eligible Redshift clusters that do not have both pause and resume schedules. */
export const redshiftPauseResumeRule = createRule({
  id: RULE_ID,
  name: 'Redshift Cluster Pause Resume Not Enabled',
  description: 'Flag eligible Redshift clusters that do not have both pause and resume schedules configured.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery', 'iac'],
  discoveryDependencies: ['aws-redshift-clusters'],
  staticDependencies: ['aws-redshift-clusters'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-redshift-clusters')
      .filter((cluster) => isPauseResumeEligible(cluster) && (!cluster.hasPauseSchedule || !cluster.hasResumeSchedule))
      .map((cluster) => createFindingMatch(cluster.clusterIdentifier, cluster.region, cluster.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-redshift-clusters')
      .filter(
        (cluster) => isStaticPauseResumeEligible(cluster) && (!cluster.hasPauseSchedule || !cluster.hasResumeSchedule),
      )
      .map((cluster) => createFindingMatch(cluster.resourceId, undefined, undefined, cluster.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
