import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-RDS-10';
const RULE_SERVICE = 'rds';
const RULE_MESSAGE = 'Manual RDS snapshots older than 90 days should be reviewed for cleanup.';

const DAY_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_MAX_AGE_DAYS = 90;

/** Flag manual RDS snapshots older than 90 days. */
export const rdsManualSnapshotMaxAgeRule = createRule({
  id: RULE_ID,
  name: 'RDS Manual Snapshot Max Age Exceeded',
  description: 'Flag manual RDS snapshots older than 90 days.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-rds-snapshots'],
  evaluateLive: ({ resources }) => {
    const cutoff = Date.now() - SNAPSHOT_MAX_AGE_DAYS * DAY_MS;
    const findings = resources
      .get('aws-rds-snapshots')
      .filter((snapshot) => {
        if (snapshot.snapshotType !== 'manual' || !snapshot.snapshotCreateTime) {
          return false;
        }

        const snapshotCreateTime = Date.parse(snapshot.snapshotCreateTime);

        return Number.isFinite(snapshotCreateTime) && snapshotCreateTime <= cutoff;
      })
      .map((snapshot) => createFindingMatch(snapshot.dbSnapshotIdentifier, snapshot.region, snapshot.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
