import {
  createFinding,
  createFindingMatch,
  createLiveEvaluationCoverage,
  createRule,
  getAwsResourceScopeKey,
} from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-DYNAMODB-3';
const RULE_SERVICE = 'dynamodb';
const RULE_SEVERITY = 'high' as const;
const RULE_MESSAGE = 'Provisioned DynamoDB tables should not remain unused for 30 days.';
const getTableKey = (accountId: string, region: string, tableArn: string): string =>
  `${accountId}:${region}:${tableArn}`;

/** Flag provisioned DynamoDB tables that show no consumed capacity over the last 30 days. */
export const dynamoDbUnusedTableRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'DynamoDB Table Unused',
  description: 'Flag provisioned DynamoDB tables with no consumed read or write capacity over the last 30 days.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-dynamodb-tables', 'aws-dynamodb-table-utilization'],
  getLiveEvaluationCoverage: ({ resources }) => {
    const metricsByResource = new Map(
      resources
        .get('aws-dynamodb-table-utilization')
        .map((metric) => [getAwsResourceScopeKey(metric.accountId, metric.region, metric.tableArn), metric]),
    );

    return createLiveEvaluationCoverage(
      resources.get('aws-dynamodb-tables'),
      (resource) => {
        const metric = metricsByResource.get(
          getAwsResourceScopeKey(resource.accountId, resource.region, resource.tableArn),
        );

        return (
          resource.billingMode !== 'PROVISIONED' ||
          (metric?.totalConsumedReadCapacityUnitsLast30Days != null &&
            metric.totalConsumedWriteCapacityUnitsLast30Days != null)
        );
      },
      (resource) => createFindingMatch(resource.tableArn, resource.region, resource.accountId),
    );
  },
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

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
