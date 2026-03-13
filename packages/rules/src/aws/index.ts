import { ebsRules } from './ebs/index.js';
import { ec2Rules } from './ec2/index.js';
import { ecrRules } from './ecr/index.js';
import { lambdaRules } from './lambda/index.js';
import { rdsRules } from './rds/index.js';
import { s3Rules } from './s3/index.js';

// Intent: aggregate all AWS rules into a single provider collection.
// TODO(cloudburn): keep this list synchronized as new AWS rules are added.
export const awsRules = [...ec2Rules, ...ebsRules, ...ecrRules, ...rdsRules, ...s3Rules, ...lambdaRules];
