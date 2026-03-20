import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EBS-6';
const RULE_SERVICE = 'ebs';
const RULE_MESSAGE = 'EBS io1 and io2 volumes at 16000 IOPS or below should be reviewed for gp3.';
// Keep io1 here even though EBS-1 also flags it. EBS-1 covers generation, while EBS-6 highlights
// the narrower gp3 migration opportunity for low-IOPS workloads.
const GP3_CANDIDATE_VOLUME_TYPES = new Set(['io1', 'io2']);
// Use IOPS-only eligibility for gp3 review. Throughput is intentionally out of scope for this heuristic.
const GP3_MIGRATION_IOPS_THRESHOLD = 16000;

/** Flag io1 and io2 EBS volumes that fall within the gp3 migration IOPS heuristic. */
export const ebsLowIopsVolumeRule = createRule({
  id: RULE_ID,
  name: 'EBS Volume Low Provisioned IOPS On io1/io2',
  description: 'Flag io1 and io2 EBS volumes at 16000 IOPS or below as gp3 review candidates.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ebs-volumes'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ebs-volumes')
      .filter(
        (volume) =>
          GP3_CANDIDATE_VOLUME_TYPES.has(volume.volumeType) &&
          volume.iops !== undefined &&
          volume.iops <= GP3_MIGRATION_IOPS_THRESHOLD,
      )
      .map((volume) => createFindingMatch(volume.volumeId, volume.region, volume.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
