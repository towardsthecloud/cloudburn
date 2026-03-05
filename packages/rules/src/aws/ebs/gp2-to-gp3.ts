import { createRule } from '../../shared/helpers.js';

// Intent: placeholder rule scaffold for AWS EBS gp2-to-gp3 recommendations.
// TODO(cloudburn): detect gp2 volumes and recommend gp3 migration.
export const ebsGp2ToGp3Rule = createRule({
  id: 'ebs-gp2-to-gp3',
  name: 'EBS gp2 to gp3',
  description: 'Recommend migrating gp2 volumes to gp3 for lower cost.',
  provider: 'aws',
  service: 'ebs',
  severity: 'warning',
  supports: ['static', 'live'],
});
