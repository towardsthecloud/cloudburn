import { createRule } from '../../shared/helpers.js';

export const ebsGp2ToGp3Rule = createRule({
  id: 'ebs-gp2-to-gp3',
  name: 'EBS gp2 to gp3',
  description: 'Recommend migrating gp2 volumes to gp3 for lower cost.',
  provider: 'aws',
  service: 'ebs',
  severity: 'warning',
  supports: ['live'],
  evaluateLive: ({ ebsVolumes }) =>
    ebsVolumes
      .filter((volume) => volume.volumeType === 'gp2')
      .map((volume) => ({
        id: `ebs-gp2-to-gp3:${volume.volumeId}`,
        ruleId: 'ebs-gp2-to-gp3',
        severity: 'warning',
        message: `EBS volume ${volume.volumeId} uses gp2; migrate to gp3.`,
        location: `aws://ebs/${volume.region}/${volume.volumeId}`,
        mode: 'live',
      })),
});
