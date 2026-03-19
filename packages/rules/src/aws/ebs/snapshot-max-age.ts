import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EBS-8';
const RULE_SERVICE = 'ebs';
const RULE_MESSAGE = 'EBS snapshots older than 90 days should be reviewed.';
const DAY_IN_MS = 24 * 60 * 60 * 1000;
// Snapshot age uses a fixed 90-day review window and skips snapshots with unknown or non-completed state.
const SNAPSHOT_MAX_AGE_DAYS = 90;

const isOlderThanMaxAge = (startTime: string | undefined, now: number): boolean => {
  if (!startTime) {
    return false;
  }

  const parsedStartTime = Date.parse(startTime);

  return Number.isFinite(parsedStartTime) && parsedStartTime < now - SNAPSHOT_MAX_AGE_DAYS * DAY_IN_MS;
};

/** Flag completed EBS snapshots that are older than the max-age threshold. */
export const ebsSnapshotMaxAgeRule = createRule({
  id: RULE_ID,
  name: 'EBS Snapshot Max Age Exceeded',
  description: 'Flag completed EBS snapshots older than 90 days.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ebs-snapshots'],
  evaluateLive: ({ resources }) => {
    const now = Date.now();
    const findings = resources
      .get('aws-ebs-snapshots')
      .filter((snapshot) => snapshot.state === 'completed' && isOlderThanMaxAge(snapshot.startTime, now))
      .map((snapshot) => createFindingMatch(snapshot.snapshotId, snapshot.region, snapshot.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
