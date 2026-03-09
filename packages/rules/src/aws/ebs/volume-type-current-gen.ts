import { createFinding, createRule } from '../../shared/helpers.js';
import type { SourceLocation } from '../../shared/metadata.js';

const RULE_ID = 'CLDBRN-AWS-EBS-1';
const RULE_SERVICE = 'ebs';
const RULE_MESSAGE = 'EBS volumes should use current-generation storage.';
const TERRAFORM_EBS_VOLUME_TYPE = 'aws_ebs_volume';
const CLOUDFORMATION_EBS_VOLUME_TYPE = 'AWS::EC2::Volume';

const createFindingMatch = (resourceId: string, region?: string, location?: SourceLocation) => ({
  resourceId,
  ...(region ? { region } : {}),
  ...(location ? { location } : {}),
});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const toStaticFindingMatch = (
  resource: {
    type: string;
    name: string;
    location?: SourceLocation;
    attributeLocations?: Record<string, SourceLocation>;
  },
  resourceId: string,
) =>
  createFindingMatch(
    resourceId,
    undefined,
    resource.attributeLocations?.type ?? resource.attributeLocations?.['Properties.VolumeType'] ?? resource.location,
  );

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
  evaluateStatic: ({ iacResources }) => {
    const findings = iacResources.flatMap((resource) => {
      if (resource.provider !== 'aws') {
        return [];
      }

      if (resource.type === TERRAFORM_EBS_VOLUME_TYPE && resource.attributes.type === 'gp2') {
        return [toStaticFindingMatch(resource, `${resource.type}.${resource.name}`)];
      }

      const properties = isRecord(resource.attributes.Properties) ? resource.attributes.Properties : undefined;

      if (resource.type === CLOUDFORMATION_EBS_VOLUME_TYPE && properties && properties.VolumeType === 'gp2') {
        return [toStaticFindingMatch(resource, resource.name)];
      }

      return [];
    });

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
