import { createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EBS-1';

export const ebsVolumeTypeCurrentGenRule = createRule({
  id: RULE_ID,
  name: 'EBS Volume Type Not Current Generation',
  description: 'Flag EBS volumes using previous-generation gp2 type instead of gp3.',
  provider: 'aws',
  service: 'ebs',
  supports: ['discovery'],
  evaluateLive: ({ ebsVolumes }) =>
    ebsVolumes
      .filter((volume) => volume.volumeType === 'gp2')
      .map((volume) => ({
        id: `${RULE_ID}:${volume.volumeId}`,
        ruleId: RULE_ID,
        message: `EBS volume ${volume.volumeId} uses gp2; migrate to gp3.`,
        resource: {
          provider: 'aws' as const,
          accountId: '',
          region: volume.region,
          service: 'ebs',
          resourceId: volume.volumeId,
        },
        source: 'discovery' as const,
      })),
});
