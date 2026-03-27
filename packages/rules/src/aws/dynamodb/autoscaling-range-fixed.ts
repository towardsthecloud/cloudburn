import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-DYNAMODB-4';
const RULE_SERVICE = 'dynamodb';
const RULE_MESSAGE = 'Provisioned DynamoDB autoscaling should allow capacity to change.';

const hasFixedRange = (minCapacity: number | null | undefined, maxCapacity: number | null | undefined): boolean =>
  typeof minCapacity === 'number' && typeof maxCapacity === 'number' && minCapacity === maxCapacity;

/** Flag provisioned-capacity DynamoDB tables whose table autoscaling min and max capacity are identical. */
export const dynamoDbAutoscalingRangeFixedRule = createRule({
  id: RULE_ID,
  name: 'DynamoDB Autoscaling Range Fixed',
  description: 'Flag provisioned-capacity DynamoDB tables whose table autoscaling min and max capacity are identical.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['iac'],
  staticDependencies: ['aws-dynamodb-tables', 'aws-dynamodb-autoscaling'],
  evaluateStatic: ({ resources }) => {
    const autoscalingByTable = new Map(
      resources
        .get('aws-dynamodb-autoscaling')
        .filter((table) => table.tableName !== null)
        .map((table) => [table.tableName, table] as const),
    );
    const findings = resources
      .get('aws-dynamodb-tables')
      .filter((table) => table.billingMode === 'PROVISIONED' && table.tableName !== null)
      .filter((table) => {
        const autoscaling = autoscalingByTable.get(table.tableName);

        if (!autoscaling) {
          return false;
        }

        return (
          hasFixedRange(autoscaling.readMinCapacity, autoscaling.readMaxCapacity) ||
          hasFixedRange(autoscaling.writeMinCapacity, autoscaling.writeMaxCapacity)
        );
      })
      .map((table) => createFindingMatch(table.resourceId, undefined, undefined, table.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
