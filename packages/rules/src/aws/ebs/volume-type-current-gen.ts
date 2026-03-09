import { createFinding, createRule } from '../../shared/helpers.js';
import type { SourceLocation } from '../../shared/metadata.js';

const RULE_ID = 'CLDBRN-AWS-EBS-1';
const RULE_SERVICE = 'ebs';
const RULE_MESSAGE = 'EBS volumes should use current-generation storage.';

const createFindingMatch = (resourceId: string, region?: string, location?: SourceLocation) => ({
  resourceId,
  ...(region ? { region } : {}),
  ...(location ? { location } : {}),
});

export const ebsVolumeTypeCurrentGenRule = createRule({
  id: RULE_ID,
  name: 'EBS Volume Type Not Current Generation',
  description: 'Flag EBS volumes using previous-generation gp2 type instead of gp3.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery', 'iac'],
  evaluateLive: ({ ebsVolumes }) => {
    const findings = ebsVolumes
      .filter((volume) => volume.volumeType === 'gp2')
      .map((volume) => createFindingMatch(volume.volumeId, volume.region));

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
  evaluateStatic: ({ terraformResources }) => {
    const findings = terraformResources
      .filter((resource) => resource.provider === 'aws' && resource.type === 'aws_ebs_volume')
      .filter((resource) => resource.attributes.type === 'gp2')
      .map((resource) =>
        createFindingMatch(
          `${resource.type}.${resource.name}`,
          undefined,
          resource.attributeLocations?.type ?? resource.location,
        ),
      );

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
