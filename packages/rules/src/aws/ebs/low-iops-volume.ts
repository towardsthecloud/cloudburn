import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EBS-6';
const RULE_SERVICE = 'ebs';
const RULE_MESSAGE = 'EBS io1 and io2 volumes at 16000 IOPS or below should be reviewed for gp3.';
// Keep io1 here even though EBS-1 also flags it. EBS-1 covers generation, while EBS-6 highlights
// the narrower gp3 migration opportunity for low-IOPS workloads.
const GP3_CANDIDATE_VOLUME_TYPES = new Set(['io1', 'io2']);
// Use IOPS-only eligibility for gp3 review. Throughput is intentionally out of scope for this heuristic.
const GP3_MIGRATION_IOPS_THRESHOLD = 16000;

const isGp3MigrationCandidate = (volumeType: string | null | undefined, iops: number | null | undefined): boolean =>
  volumeType !== null &&
  volumeType !== undefined &&
  GP3_CANDIDATE_VOLUME_TYPES.has(volumeType) &&
  iops !== null &&
  iops !== undefined &&
  iops <= GP3_MIGRATION_IOPS_THRESHOLD;

/** Flag io1 and io2 EBS volumes that fall within the gp3 migration IOPS heuristic. */
export const ebsLowIopsVolumeRule = createRule({
  id: RULE_ID,
  name: 'EBS Volume Low Provisioned IOPS On io1/io2',
  description: 'Flag io1 and io2 EBS volumes at 16000 IOPS or below as gp3 review candidates.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery', 'iac'],
  discoveryDependencies: ['aws-ebs-volumes'],
  staticDependencies: ['aws-ebs-volumes'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ebs-volumes')
      .filter((volume) => isGp3MigrationCandidate(volume.volumeType, volume.iops))
      .map((volume) => createFindingMatch(volume.volumeId, volume.region, volume.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-ebs-volumes')
      .filter((volume) => isGp3MigrationCandidate(volume.volumeType, volume.iops))
      .map((volume) => createFindingMatch(volume.resourceId, undefined, undefined, volume.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
