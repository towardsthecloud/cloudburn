import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-DYNAMODB-1';
const RULE_SERVICE = 'dynamodb';
const RULE_MESSAGE = 'DynamoDB tables whose data has not changed for more than 90 days should be reviewed.';
const DAY_MS = 24 * 60 * 60 * 1000;
// Match the upstream default by treating a stream label older than 90 days as stale data.
const STALE_DATA_DAYS = 90;

/** Flag DynamoDB tables whose latest observed change is older than the stale-data threshold. */
export const dynamoDbStaleTableDataRule = createRule({
  id: RULE_ID,
  name: 'DynamoDB Table Stale Data',
  description: 'Flag DynamoDB tables with no data changes exceeding a threshold (default 90 days).',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-dynamodb-tables'],
  evaluateLive: ({ resources }) => {
    const cutoff = Date.now() - STALE_DATA_DAYS * DAY_MS;
    const findings = resources
      .get('aws-dynamodb-tables')
      // DynamoDB only reports the latest stream label when Streams are enabled, so tables without it are skipped.
      .filter((table) => {
        if (!table.latestStreamLabel) {
          return false;
        }

        const latestStreamLabel = Date.parse(table.latestStreamLabel);
        return !Number.isNaN(latestStreamLabel) && latestStreamLabel < cutoff;
      })
      .map((table) => createFindingMatch(table.tableArn, table.region, table.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
