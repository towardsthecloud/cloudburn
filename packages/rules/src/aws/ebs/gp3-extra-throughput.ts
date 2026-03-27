import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EBS-8';
const RULE_SERVICE = 'ebs';
const RULE_MESSAGE = 'EBS gp3 volumes should avoid paid throughput above the included baseline unless required.';

/** Flag gp3 volumes that provision throughput above the included 125 MiB/s baseline. */
export const ebsGp3ExtraThroughputRule = createRule({
  id: RULE_ID,
  name: 'EBS gp3 Volume Extra Throughput Provisioned',
  description: 'Flag gp3 volumes that provision throughput above the included 125 MiB/s baseline.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['iac'],
  staticDependencies: ['aws-ebs-volumes'],
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-ebs-volumes')
      .filter(
        (volume) =>
          volume.volumeType === 'gp3' && typeof volume.throughputMiBps === 'number' && volume.throughputMiBps > 125,
      )
      .map((volume) => createFindingMatch(volume.resourceId, undefined, undefined, volume.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
