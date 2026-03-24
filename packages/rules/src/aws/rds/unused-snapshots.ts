import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-RDS-7';
const RULE_SERVICE = 'rds';
const RULE_MESSAGE = 'RDS snapshots without a source DB instance should be reviewed for cleanup.';
const DAY_MS = 24 * 60 * 60 * 1000;
// Give orphaned snapshots a 30-day grace period before review to avoid flagging recent intentional retention.
const ORPHANED_SNAPSHOT_GRACE_DAYS = 30;
const getInstanceKey = (accountId: string, region: string, dbInstanceIdentifier: string): string =>
  `${accountId}:${region}:${dbInstanceIdentifier}`;

/** Flag aged RDS snapshots whose source DB instance no longer exists. */
export const rdsUnusedSnapshotsRule = createRule({
  id: RULE_ID,
  name: 'RDS Snapshot Without Source DB Instance',
  description: 'Flag RDS snapshots older than 30 days whose source DB instance no longer exists.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-rds-snapshots', 'aws-rds-instances'],
  evaluateLive: ({ resources }) => {
    const now = Date.now();
    const cutoff = now - ORPHANED_SNAPSHOT_GRACE_DAYS * DAY_MS;
    const activeInstanceIds = new Set(
      resources
        .get('aws-rds-instances')
        .map((instance) => getInstanceKey(instance.accountId, instance.region, instance.dbInstanceIdentifier)),
    );

    const findings = resources
      .get('aws-rds-snapshots')
      .filter((snapshot) => {
        if (
          !snapshot.dbInstanceIdentifier ||
          activeInstanceIds.has(getInstanceKey(snapshot.accountId, snapshot.region, snapshot.dbInstanceIdentifier))
        ) {
          return false;
        }

        const snapshotCreateTime = snapshot.snapshotCreateTime ? Date.parse(snapshot.snapshotCreateTime) : Number.NaN;

        return !Number.isNaN(snapshotCreateTime) && snapshotCreateTime <= cutoff;
      })
      .map((snapshot) => createFindingMatch(snapshot.dbSnapshotIdentifier, snapshot.region, snapshot.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
