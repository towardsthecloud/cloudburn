import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-DYNAMODB-3';
const RULE_SERVICE = 'dynamodb';
const RULE_MESSAGE = 'Provisioned DynamoDB tables should not remain unused for 30 days.';
const getTableKey = (accountId: string, region: string, tableArn: string): string => `${accountId}:${region}:${tableArn}`;

/** Flag provisioned DynamoDB tables that show no consumed capacity over the last 30 days. */
export const dynamoDbUnusedTableRule = createRule({
  id: RULE_ID,
  name: 'DynamoDB Table Unused',
  description: 'Flag provisioned DynamoDB tables with no consumed read or write capacity over the last 30 days.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-dynamodb-tables', 'aws-dynamodb-table-utilization'],
  evaluateLive: ({ resources }) => {
    const tablesByKey = new Map(
      resources
        .get('aws-dynamodb-tables')
        .map((table) => [getTableKey(table.accountId, table.region, table.tableArn), table] as const),
    );

    const findings = resources
      .get('aws-dynamodb-table-utilization')
      .filter((utilization) => {
        const table = tablesByKey.get(getTableKey(utilization.accountId, utilization.region, utilization.tableArn));

        return (
          table?.billingMode === 'PROVISIONED' &&
          utilization.totalConsumedReadCapacityUnitsLast30Days === 0 &&
          utilization.totalConsumedWriteCapacityUnitsLast30Days === 0
        );
      })
      .map((utilization) => createFindingMatch(utilization.tableArn, utilization.region, utilization.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
