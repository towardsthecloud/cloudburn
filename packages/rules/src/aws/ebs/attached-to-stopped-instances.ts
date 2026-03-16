import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EBS-3';
const RULE_SERVICE = 'ebs';
const RULE_MESSAGE = 'EBS volumes attached only to stopped EC2 instances should be reviewed.';

/** Flag EBS volumes whose attached EC2 instances are all in the stopped state. */
export const ebsAttachedToStoppedInstancesRule = createRule({
  id: RULE_ID,
  name: 'EBS Volume Attached To Stopped Instances',
  description: 'Flag EBS volumes whose attached EC2 instances are all in the stopped state.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ebs-volumes', 'aws-ec2-instances'],
  evaluateLive: ({ resources }) => {
    const instanceStateById = new Map(
      resources
        .get('aws-ec2-instances')
        .filter((instance) => instance.state !== undefined)
        .map((instance) => [instance.instanceId, instance.state] as const),
    );

    const findings = resources
      .get('aws-ebs-volumes')
      .filter((volume) => {
        const attachedInstanceIds = (volume.attachments ?? [])
          .map((attachment) => attachment.instanceId)
          .filter((instanceId): instanceId is string => typeof instanceId === 'string');

        if (attachedInstanceIds.length === 0) {
          return false;
        }

        const attachedInstanceStates = attachedInstanceIds.map((instanceId) => instanceStateById.get(instanceId));

        if (attachedInstanceStates.some((state) => state === undefined)) {
          return false;
        }

        return attachedInstanceStates.every((state) => state === 'stopped');
      })
      .map((volume) => createFindingMatch(volume.volumeId, volume.region, volume.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
