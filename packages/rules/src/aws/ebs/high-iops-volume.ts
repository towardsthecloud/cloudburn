import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EBS-5';
const RULE_SERVICE = 'ebs';
const RULE_MESSAGE = 'EBS io1 and io2 volumes above 32000 IOPS should be reviewed.';
const HIGH_IOPS_VOLUME_TYPES = new Set(['io1', 'io2']);
// Treat 32k IOPS as the threshold where provisioned io1/io2 volumes merit explicit review.
const HIGH_IOPS_THRESHOLD = 32000;

/** Flag io1 and io2 EBS volumes provisioned above the high-IOPS threshold. */
export const ebsHighIopsVolumeRule = createRule({
  id: RULE_ID,
  name: 'EBS Volume High Provisioned IOPS',
  description: 'Flag io1 and io2 EBS volumes with provisioned IOPS above 32000.',
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
          HIGH_IOPS_VOLUME_TYPES.has(volume.volumeType) &&
          volume.iops !== undefined &&
          volume.iops > HIGH_IOPS_THRESHOLD,
      )
      .map((volume) => createFindingMatch(volume.volumeId, volume.region, volume.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
