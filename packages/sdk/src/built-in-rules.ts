import { awsRules, azureRules, gcpRules } from '@cloudburn/rules';
import type { BuiltInRuleMetadata, Rule } from './types.js';

const serviceDisplayNames: Record<string, string> = {
  apigateway: 'API Gateway',
  cloudfront: 'CloudFront',
  cloudtrail: 'CloudTrail',
  cloudwatch: 'CloudWatch',
  costexplorer: 'Cost Explorer',
  costguardrails: 'Cost Guardrails',
  dynamodb: 'DynamoDB',
  ebs: 'EBS',
  ec2: 'EC2',
  ecr: 'ECR',
  ecs: 'ECS',
  eks: 'EKS',
  elasticache: 'ElastiCache',
  elb: 'Elastic Load Balancing',
  emr: 'EMR',
  lambda: 'Lambda',
  rds: 'RDS',
  redshift: 'Redshift',
  route53: 'Route 53',
  s3: 'S3',
  sagemaker: 'SageMaker',
  secretsmanager: 'Secrets Manager',
  tagging: 'Tagging',
};

export const toBuiltInRuleMetadata = ({
  description,
  id,
  message,
  name,
  provider,
  service,
  severity,
  supports,
}: Rule): BuiltInRuleMetadata => ({
  description,
  id,
  message,
  name,
  provider,
  service,
  serviceName: serviceDisplayNames[service] ?? service,
  severity,
  supports: [...supports],
});

const compareBuiltInRules = (left: BuiltInRuleMetadata, right: BuiltInRuleMetadata): number =>
  left.provider.localeCompare(right.provider) ||
  left.service.localeCompare(right.service) ||
  left.id.localeCompare(right.id, undefined, { numeric: true });

/**
 * Projects built-in rules into a serializable metadata view and sorts them for stable CLI output.
 *
 * @param rules - Built-in rules to expose through the SDK metadata surface.
 * @returns Built-in rule metadata ordered by provider, service, and numeric rule suffix.
 */
export const listBuiltInRuleMetadata = (rules: Rule[]): BuiltInRuleMetadata[] =>
  rules.map(toBuiltInRuleMetadata).sort(compareBuiltInRules);

/** Stable metadata for all built-in CloudBurn rules, ordered by provider, service, and rule ID. */
export const builtInRuleMetadata: BuiltInRuleMetadata[] = listBuiltInRuleMetadata([
  ...awsRules,
  ...azureRules,
  ...gcpRules,
]);
