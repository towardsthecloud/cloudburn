import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EBS-9';
const RULE_SERVICE = 'ebs';
const RULE_MESSAGE = 'EBS gp3 volumes should avoid paid IOPS above the included baseline unless required.';

/** Flag gp3 volumes that provision IOPS above the included 3000 baseline. */
export const ebsGp3ExtraIopsRule = createRule({
  id: RULE_ID,
  name: 'EBS gp3 Volume Extra IOPS Provisioned',
  description: 'Flag gp3 volumes that provision IOPS above the included 3000 baseline.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['iac'],
  staticDependencies: ['aws-ebs-volumes'],
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-ebs-volumes')
      .filter((volume) => volume.volumeType === 'gp3' && volume.iops !== null && volume.iops > 3000)
      .map((volume) => createFindingMatch(volume.resourceId, undefined, undefined, volume.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
