import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EBS-5';
const RULE_SERVICE = 'ebs';
const RULE_MESSAGE = 'EBS io1 and io2 volumes above 32000 IOPS should be reviewed.';
const HIGH_IOPS_VOLUME_TYPES = new Set(['io1', 'io2']);
// Treat 32k IOPS as the threshold where provisioned io1/io2 volumes merit explicit review.
const HIGH_IOPS_THRESHOLD = 32000;

const hasHighProvisionedIops = (volumeType: string | null | undefined, iops: number | null | undefined): boolean =>
  volumeType !== null &&
  volumeType !== undefined &&
  HIGH_IOPS_VOLUME_TYPES.has(volumeType) &&
  iops !== null &&
  iops !== undefined &&
  iops > HIGH_IOPS_THRESHOLD;

/** Flag io1 and io2 EBS volumes provisioned above the high-IOPS threshold. */
export const ebsHighIopsVolumeRule = createRule({
  id: RULE_ID,
  name: 'EBS Volume High Provisioned IOPS',
  description: 'Flag io1 and io2 EBS volumes with provisioned IOPS above 32000.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery', 'iac'],
  discoveryDependencies: ['aws-ebs-volumes'],
  staticDependencies: ['aws-ebs-volumes'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ebs-volumes')
      .filter((volume) => hasHighProvisionedIops(volume.volumeType, volume.iops))
      .map((volume) => createFindingMatch(volume.volumeId, volume.region, volume.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-ebs-volumes')
      .filter((volume) => hasHighProvisionedIops(volume.volumeType, volume.iops))
      .map((volume) => createFindingMatch(volume.resourceId, undefined, undefined, volume.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
