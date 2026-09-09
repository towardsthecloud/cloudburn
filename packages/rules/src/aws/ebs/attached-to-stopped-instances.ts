import { createFinding, createFindingMatch, createLiveEvaluationCoverage, createRule } from '../../shared/helpers.js';
import type { AwsEbsVolume, AwsEc2Instance } from '../../shared/metadata.js';

const RULE_ID = 'CLDBRN-AWS-EBS-3';
const RULE_SERVICE = 'ebs';
const RULE_SEVERITY = 'high' as const;
const RULE_MESSAGE = 'EBS volumes attached only to stopped EC2 instances should be reviewed.';

const toInstanceStateById = (instances: readonly AwsEc2Instance[]): Map<string, string> =>
  new Map(
    instances.flatMap((instance) =>
      instance.state === undefined ? [] : [[instance.instanceId, instance.state] as const],
    ),
  );

/**
 * Resolves the state of every instance a volume is attached to.
 *
 * @returns `null` when the volume has no attachments; otherwise one entry per attachment, where `undefined` marks an
 * attachment without an instance ID, an instance missing from the inventory, or an instance with no reported state.
 */
const resolveAttachedInstanceStates = (
  volume: AwsEbsVolume,
  instanceStateById: ReadonlyMap<string, string>,
): Array<string | undefined> | null => {
  const attachments = volume.attachments ?? [];

  if (attachments.length === 0) {
    return null;
  }

  return attachments.map((attachment) =>
    attachment.instanceId === undefined ? undefined : instanceStateById.get(attachment.instanceId),
  );
};

const isStopped = (state: string | undefined): boolean => state === 'stopped';

/** Flag EBS volumes whose attached EC2 instances are all in the stopped state. */
export const ebsAttachedToStoppedInstancesRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'EBS Volume Attached To Stopped Instances',
  description: 'Flag EBS volumes whose attached EC2 instances are all in the stopped state.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ebs-volumes', 'aws-ec2-instances'],
  // Unattached volumes are outside this policy and count as assessed, and one attached instance that is known not to
  // be stopped settles the verdict. Otherwise an attachment without an instance ID, an instance missing from the
  // inventory, or an instance with no reported state leaves the volume unknown instead of passing.
  getLiveEvaluationCoverage: ({ resources }) => {
    const instanceStateById = toInstanceStateById(resources.get('aws-ec2-instances'));

    return createLiveEvaluationCoverage(
      resources.get('aws-ebs-volumes'),
      (volume) => {
        const states = resolveAttachedInstanceStates(volume, instanceStateById);

        return (
          states === null ||
          states.some((state) => state !== undefined && !isStopped(state)) ||
          states.every((state) => state !== undefined)
        );
      },
      (volume) => createFindingMatch(volume.volumeId, volume.region, volume.accountId),
    );
  },
  evaluateLive: ({ resources }) => {
    const instanceStateById = toInstanceStateById(resources.get('aws-ec2-instances'));

    const findings = resources
      .get('aws-ebs-volumes')
      .filter((volume) => {
        const states = resolveAttachedInstanceStates(volume, instanceStateById);

        return states?.every(isStopped) ?? false;
      })
      .map((volume) => createFindingMatch(volume.volumeId, volume.region, volume.accountId));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
