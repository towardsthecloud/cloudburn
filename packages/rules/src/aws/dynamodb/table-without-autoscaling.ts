import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-DYNAMODB-2';
const RULE_SERVICE = 'dynamodb';
const RULE_MESSAGE = 'Provisioned-capacity DynamoDB tables should use auto-scaling.';

const createScopeKey = (accountId: string, region: string, tableArn: string): string =>
  `${accountId}:${region}:${tableArn}`;

/** Flag provisioned-capacity DynamoDB tables that have no table-level autoscaling targets. */
export const dynamoDbTableWithoutAutoscalingRule = createRule({
  id: RULE_ID,
  name: 'DynamoDB Table Without Autoscaling',
  description: 'Flag provisioned-capacity DynamoDB tables without auto-scaling configured.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-dynamodb-tables', 'aws-dynamodb-autoscaling'],
  evaluateLive: ({ resources }) => {
    const autoscalingByTable = new Map(
      resources
        .get('aws-dynamodb-autoscaling')
        .map((table) => [createScopeKey(table.accountId, table.region, table.tableArn), table] as const),
    );
    const findings = resources
      .get('aws-dynamodb-tables')
      .filter((table) => table.billingMode !== 'PAY_PER_REQUEST')
      .filter((table) => {
        const autoscaling = autoscalingByTable.get(createScopeKey(table.accountId, table.region, table.tableArn));

        // Only table-level scalable targets count here; GSI targets do not scale the table itself.
        return autoscaling ? !autoscaling.hasReadTarget && !autoscaling.hasWriteTarget : true;
      })
      .map((table) => createFindingMatch(table.tableArn, table.region, table.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
