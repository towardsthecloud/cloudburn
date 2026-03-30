import { dynamoDbAutoscalingRangeFixedRule } from './autoscaling-range-fixed.js';
import { dynamoDbStaleTableDataRule } from './stale-table-data.js';
import { dynamoDbTableWithoutAutoscalingRule } from './table-without-autoscaling.js';
import { dynamoDbUnusedTableRule } from './unused-table.js';

// Intent: aggregate AWS DynamoDB rule definitions.
export const dynamodbRules = [
  dynamoDbStaleTableDataRule,
  dynamoDbTableWithoutAutoscalingRule,
  dynamoDbUnusedTableRule,
  dynamoDbAutoscalingRangeFixedRule,
];
