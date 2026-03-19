import { cloudtrailRules } from './cloudtrail/index.js';
import { cloudwatchRules } from './cloudwatch/index.js';
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
import { s3Rules } from './s3/index.js';

// Intent: aggregate all AWS rules into a single provider collection.
// TODO(cloudburn): keep this list synchronized as new AWS rules are added.
export const awsRules = [
  ...cloudtrailRules,
  ...cloudwatchRules,
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
  ...s3Rules,
  ...lambdaRules,
];
