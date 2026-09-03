import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-DYNAMODB-1';
const RULE_SERVICE = 'dynamodb';
const RULE_SEVERITY = 'medium' as const;
const RULE_MESSAGE = 'DynamoDB tables with no write activity for 90 days should be reviewed.';

/** Flag DynamoDB tables with no consumed write capacity over a complete 90-day window. */
export const dynamoDbStaleTableDataRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'DynamoDB Table Inactive',
  description: 'Flag DynamoDB tables with no consumed write capacity over a complete 90-day window.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-dynamodb-table-utilization'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-dynamodb-table-utilization')
      .filter((table) => table.totalConsumedWriteCapacityUnitsLast90Days === 0)
      .map((table) => createFindingMatch(table.tableArn, table.region, table.accountId));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
