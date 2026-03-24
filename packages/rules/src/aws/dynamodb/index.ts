import { dynamoDbStaleTableDataRule } from './stale-table-data.js';
import { dynamoDbTableWithoutAutoscalingRule } from './table-without-autoscaling.js';

// Intent: aggregate AWS DynamoDB rule definitions.
export const dynamodbRules = [dynamoDbStaleTableDataRule, dynamoDbTableWithoutAutoscalingRule];
