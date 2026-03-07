import { createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EBS-1';

const createFinding = (resourceId: string, source: 'discovery' | 'iac', region: string) => ({
  id: `${RULE_ID}:${resourceId}`,
  ruleId: RULE_ID,
  message: `EBS volume ${resourceId} uses gp2; migrate to gp3.`,
  resource: {
    provider: 'aws' as const,
    accountId: '',
    region,
    service: 'ebs',
    resourceId,
  },
  source,
});

export const ebsVolumeTypeCurrentGenRule = createRule({
  id: RULE_ID,
  name: 'EBS Volume Type Not Current Generation',
  description: 'Flag EBS volumes using previous-generation gp2 type instead of gp3.',
  provider: 'aws',
  service: 'ebs',
  supports: ['discovery', 'iac'],
  evaluateLive: ({ ebsVolumes }) =>
    ebsVolumes
      .filter((volume) => volume.volumeType === 'gp2')
      .map((volume) => createFinding(volume.volumeId, 'discovery', volume.region)),
  evaluateStatic: ({ awsEbsVolumes }) =>
    awsEbsVolumes
      .filter((volume) => volume.volumeType === 'gp2')
      .map((volume) => createFinding(volume.resourceId, 'iac', '')),
});
