# Rule ID Reference

Source of truth: rule files in `packages/rules/src/aws/`.

## ID Convention

Format: `CLDBRN-{PROVIDER}-{SERVICE}-{N}`

- All uppercase
- No zero-padding on the sequence number
- IDs are stable — no renumbering when rules are removed (gaps are allowed)
- Provider: `AWS`, `AZURE`, `GCP`
- Service: short name matching the directory (e.g. `EBS`, `EC2`, `RDS`, `S3`, `LAMBDA`)

## Rule Table

| ID                    | Name                                      | Service | Supports       | Status      |
| --------------------- | ----------------------------------------- | ------- | -------------- | ----------- |
| `CLDBRN-AWS-CLOUDTRAIL-1` | CloudTrail Redundant Global Trails     | cloudtrail | discovery   | Implemented |
| `CLDBRN-AWS-CLOUDTRAIL-2` | CloudTrail Redundant Regional Trails   | cloudtrail | discovery   | Implemented |
| `CLDBRN-AWS-CLOUDWATCH-1` | CloudWatch Log Group Missing Retention | cloudwatch | discovery   | Implemented |
| `CLDBRN-AWS-CLOUDWATCH-2` | CloudWatch Unused Log Streams          | cloudwatch | discovery   | Implemented |
| `CLDBRN-AWS-EC2-1`    | EC2 Instance Type Not Preferred           | ec2     | iac, discovery | Implemented |
| `CLDBRN-AWS-EC2-2`    | S3 Interface VPC Endpoint Used            | ec2     | iac            | Implemented |
| `CLDBRN-AWS-EC2-3`    | Elastic IP Address Unassociated           | ec2     | discovery      | Implemented |
| `CLDBRN-AWS-EC2-4`    | VPC Interface Endpoint Inactive           | ec2     | discovery      | Implemented |
| `CLDBRN-AWS-EC2-5`    | EC2 Instance Low Utilization              | ec2     | discovery      | Implemented |
| `CLDBRN-AWS-EBS-1`    | EBS Volume Type Not Current Generation    | ebs     | discovery, iac | Implemented |
| `CLDBRN-AWS-EBS-2`    | EBS Volume Unattached                     | ebs     | discovery      | Implemented |
| `CLDBRN-AWS-EBS-3`    | EBS Volume Attached To Stopped Instances  | ebs     | discovery      | Implemented |
| `CLDBRN-AWS-ECR-1`    | ECR Repository Missing Lifecycle Policy   | ecr     | iac, discovery | Implemented |
| `CLDBRN-AWS-RDS-1`    | RDS Instance Class Not Preferred          | rds     | iac, discovery | Implemented |
| `CLDBRN-AWS-RDS-2`    | RDS DB Instance Idle                      | rds     | discovery      | Implemented |
| `CLDBRN-AWS-S3-1`     | S3 Missing Lifecycle Configuration        | s3      | iac, discovery | Implemented |
| `CLDBRN-AWS-S3-2`     | S3 Bucket Storage Class Not Optimized     | s3      | iac, discovery | Implemented |
| `CLDBRN-AWS-LAMBDA-1` | Lambda Cost Optimal Architecture          | lambda  | iac, discovery | Implemented |

`CLDBRN-AWS-EBS-1` flags previous-generation EBS volume types (`gp2`, `io1`, and `standard`) and does not flag current-generation HDD families such as `st1` or `sc1`.

`CLDBRN-AWS-CLOUDWATCH-2` flags only log streams with no observed event history. Streams with older events are not treated as unused by this rule.

**Status key:**

- **Implemented** — has evaluator coverage for every scan mode listed in `supports`
- **Scaffold** — metadata defined, no evaluator implementations yet

## Presets

| Preset ID  | Name     | Rule IDs            |
| ---------- | -------- | ------------------- |
| `aws-core` | AWS Core | All AWS rules above |

Future presets (planned): `strict`, `startup`, `production`.
