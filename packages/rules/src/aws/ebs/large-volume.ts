import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EBS-4';
const RULE_SERVICE = 'ebs';
const RULE_MESSAGE = 'EBS volumes larger than 100 GiB should be reviewed.';
// Treat volumes above 100 GiB as oversized enough to warrant an explicit cost review.
const LARGE_VOLUME_SIZE_THRESHOLD_GIB = 100;

/** Flag EBS volumes that exceed the large-volume review threshold. */
export const ebsLargeVolumeRule = createRule({
  id: RULE_ID,
  name: 'EBS Volume Large Size',
  description: 'Flag EBS volumes larger than 100 GiB so their provisioned size can be reviewed intentionally.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ebs-volumes'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ebs-volumes')
      .filter((volume) => volume.sizeGiB > LARGE_VOLUME_SIZE_THRESHOLD_GIB)
      .map((volume) => createFindingMatch(volume.volumeId, volume.region, volume.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
