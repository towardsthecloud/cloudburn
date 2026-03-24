import { apigatewayRules } from './apigateway/index.js';
import { cloudfrontRules } from './cloudfront/index.js';
import { cloudtrailRules } from './cloudtrail/index.js';
import { cloudwatchRules } from './cloudwatch/index.js';
import { costexplorerRules } from './costexplorer/index.js';
import { dynamodbRules } from './dynamodb/index.js';
import { ebsRules } from './ebs/index.js';
import { ec2Rules } from './ec2/index.js';
import { ecrRules } from './ecr/index.js';
import { ecsRules } from './ecs/index.js';
import { eksRules } from './eks/index.js';
import { elastiCacheRules } from './elasticache/index.js';
import { elbRules } from './elb/index.js';
import { emrRules } from './emr/index.js';
import { lambdaRules } from './lambda/index.js';
import { rdsRules } from './rds/index.js';
import { redshiftRules } from './redshift/index.js';
import { route53Rules } from './route53/index.js';
import { s3Rules } from './s3/index.js';
import { secretsmanagerRules } from './secretsmanager/index.js';

// Intent: aggregate all AWS rules into a single provider collection.
// TODO(cloudburn): keep this list synchronized as new AWS rules are added.
export const awsRules = [
  ...apigatewayRules,
  ...cloudfrontRules,
  ...cloudtrailRules,
  ...cloudwatchRules,
  ...costexplorerRules,
  ...dynamodbRules,
  ...ec2Rules,
  ...ecsRules,
  ...eksRules,
  ...elastiCacheRules,
  ...elbRules,
  ...ebsRules,
  ...ecrRules,
  ...emrRules,
  ...rdsRules,
  ...redshiftRules,
  ...route53Rules,
  ...s3Rules,
  ...secretsmanagerRules,
  ...lambdaRules,
];
