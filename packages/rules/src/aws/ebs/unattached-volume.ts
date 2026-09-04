import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EBS-2';
const RULE_SERVICE = 'ebs';
const RULE_SEVERITY = 'medium' as const;
const RULE_MESSAGE = 'EBS volumes should not remain unattached.';

/** Flag EBS volumes that are not attached to any EC2 instance. */
export const ebsUnattachedVolumeRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'EBS Volume Unattached',
  description: 'Flag EBS volumes that are not attached to any EC2 instance.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ebs-volumes'],
  supersedesRuleIds: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-3'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ebs-volumes')
      .filter((volume) => volume.attachments?.length === 0)
      .map((volume) => ({
        ...createFindingMatch(volume.volumeId, volume.region, volume.accountId),
        resourceType: 'ec2:volume',
        actionType: 'Delete',
      }));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
