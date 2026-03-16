import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EBS-2';
const RULE_SERVICE = 'ebs';
const RULE_MESSAGE = 'EBS volumes should not remain unattached.';

/** Flag EBS volumes that are not attached to any EC2 instance. */
export const ebsUnattachedVolumeRule = createRule({
  id: RULE_ID,
  name: 'EBS Volume Unattached',
  description: 'Flag EBS volumes that are not attached to any EC2 instance.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ebs-volumes'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ebs-volumes')
      .filter((volume) => volume.attachments?.length === 0)
      .map((volume) => createFindingMatch(volume.volumeId, volume.region, volume.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
