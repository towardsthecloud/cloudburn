import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EBS-1';
const RULE_SERVICE = 'ebs';
const RULE_MESSAGE = 'EBS volumes should use current-generation storage.';
const PREVIOUS_GENERATION_EBS_VOLUME_TYPES = new Set(['gp2', 'io1', 'standard']);

const isPreviousGenerationEbsVolumeType = (volumeType: string | null | undefined): boolean =>
  volumeType !== null && volumeType !== undefined && PREVIOUS_GENERATION_EBS_VOLUME_TYPES.has(volumeType);

export const ebsVolumeTypeCurrentGenRule = createRule({
  id: RULE_ID,
  name: 'EBS Volume Type Not Current Generation',
  description: 'Flag EBS volumes using previous-generation storage types when a current-generation replacement exists.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery', 'iac'],
  discoveryDependencies: ['aws-ebs-volumes'],
  staticDependencies: ['aws-ebs-volumes'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ebs-volumes')
      .filter((volume) => isPreviousGenerationEbsVolumeType(volume.volumeType))
      .map((volume) => createFindingMatch(volume.volumeId, volume.region, volume.accountId));

    return createFinding(
      {
        id: RULE_ID,
        service: RULE_SERVICE,
        message: RULE_MESSAGE,
      },
      'discovery',
      findings,
    );
  },
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-ebs-volumes')
      .filter((volume) => isPreviousGenerationEbsVolumeType(volume.volumeType))
      .map((volume) => createFindingMatch(volume.resourceId, undefined, undefined, volume.location));

    return createFinding(
      {
        id: RULE_ID,
        service: RULE_SERVICE,
        message: RULE_MESSAGE,
      },
      'iac',
      findings,
    );
  },
});
