# Rule ID Reference

Source of truth: rule files in `packages/rules/src/aws/`.

## ID Convention

Format: `CLDBRN-{PROVIDER}-{SERVICE}-{N}`

- All uppercase
- No zero-padding on the sequence number
- IDs stay contiguous within each provider/service sequence; when a change affects the sequence, renumber later entries and update references in the same change
- Provider: `AWS`, `AZURE`, `GCP`
- Service: short name matching the directory (e.g. `EBS`, `EC2`, `RDS`, `S3`, `LAMBDA`)

## Rule Table

| ID                    | Name                                      | Service | Supports       | Status      |
| --------------------- | ----------------------------------------- | ------- | -------------- | ----------- |
| `CLDBRN-AWS-APIGATEWAY-1` | API Gateway Stage Caching Disabled    | apigateway | discovery   | Implemented |
| `CLDBRN-AWS-CLOUDFRONT-1` | CloudFront Distribution Price Class All | cloudfront | discovery | Implemented |
| `CLDBRN-AWS-CLOUDFRONT-2` | CloudFront Distribution Unused         | cloudfront | discovery | Implemented |
| `CLDBRN-AWS-CLOUDTRAIL-1` | CloudTrail Redundant Global Trails     | cloudtrail | discovery   | Implemented |
| `CLDBRN-AWS-CLOUDTRAIL-2` | CloudTrail Redundant Regional Trails   | cloudtrail | discovery   | Implemented |
| `CLDBRN-AWS-CLOUDWATCH-1` | CloudWatch Log Group Missing Retention | cloudwatch | discovery   | Implemented |
| `CLDBRN-AWS-CLOUDWATCH-2` | CloudWatch Unused Log Streams          | cloudwatch | discovery   | Implemented |
| `CLDBRN-AWS-CLOUDWATCH-3` | CloudWatch Log Group No Metric Filters | cloudwatch | discovery   | Implemented |
| `CLDBRN-AWS-COSTGUARDRAILS-1` | AWS Budgets Missing               | costguardrails | discovery | Implemented |
| `CLDBRN-AWS-COSTGUARDRAILS-2` | Cost Anomaly Detection Missing    | costguardrails | discovery | Implemented |
| `CLDBRN-AWS-COSTEXPLORER-1` | Cost Explorer Full Month Cost Changes | costexplorer | discovery | Implemented |
| `CLDBRN-AWS-DYNAMODB-1` | DynamoDB Table Stale Data              | dynamodb | discovery     | Implemented |
| `CLDBRN-AWS-DYNAMODB-2` | DynamoDB Table Without Autoscaling     | dynamodb | discovery     | Implemented |
| `CLDBRN-AWS-DYNAMODB-3` | DynamoDB Table Unused                  | dynamodb | discovery     | Implemented |
| `CLDBRN-AWS-EC2-1`    | EC2 Instance Type Not Preferred           | ec2     | iac, discovery | Implemented |
| `CLDBRN-AWS-EC2-2`    | S3 Interface VPC Endpoint Used            | ec2     | iac            | Implemented |
| `CLDBRN-AWS-EC2-3`    | Elastic IP Address Unassociated           | ec2     | discovery      | Implemented |
| `CLDBRN-AWS-EC2-4`    | VPC Interface Endpoint Inactive           | ec2     | discovery      | Implemented |
| `CLDBRN-AWS-EC2-5`    | EC2 Instance Low Utilization              | ec2     | discovery      | Implemented |
| `CLDBRN-AWS-EC2-6`    | EC2 Instance Without Graviton             | ec2     | discovery      | Implemented |
| `CLDBRN-AWS-EC2-7`    | EC2 Reserved Instance Expiring            | ec2     | discovery      | Implemented |
| `CLDBRN-AWS-EC2-8`    | EC2 Instance Large Size                   | ec2     | discovery      | Implemented |
| `CLDBRN-AWS-EC2-9`    | EC2 Instance Long Running                 | ec2     | discovery      | Implemented |
| `CLDBRN-AWS-ECS-1`    | ECS Container Instance Without Graviton   | ecs     | discovery      | Implemented |
| `CLDBRN-AWS-ECS-2`    | ECS Cluster Low CPU Utilization           | ecs     | discovery      | Implemented |
| `CLDBRN-AWS-ECS-3`    | ECS Service Missing Autoscaling Policy    | ecs     | discovery      | Implemented |
| `CLDBRN-AWS-EBS-1`    | EBS Volume Type Not Current Generation    | ebs     | discovery, iac | Implemented |
| `CLDBRN-AWS-EBS-2`    | EBS Volume Unattached                     | ebs     | discovery      | Implemented |
| `CLDBRN-AWS-EBS-3`    | EBS Volume Attached To Stopped Instances  | ebs     | discovery      | Implemented |
| `CLDBRN-AWS-EBS-4`    | EBS Volume Large Size                     | ebs     | discovery      | Implemented |
| `CLDBRN-AWS-EBS-5`    | EBS Volume High Provisioned IOPS          | ebs     | discovery      | Implemented |
| `CLDBRN-AWS-EBS-6`    | EBS Volume Low Provisioned IOPS On io1/io2 | ebs   | discovery      | Implemented |
| `CLDBRN-AWS-EBS-7`    | EBS Snapshot Max Age Exceeded             | ebs     | discovery      | Implemented |
| `CLDBRN-AWS-ECR-1`    | ECR Repository Missing Lifecycle Policy   | ecr     | iac, discovery | Implemented |
| `CLDBRN-AWS-EKS-1`    | EKS Node Group Without Graviton           | eks     | discovery      | Implemented |
| `CLDBRN-AWS-ELASTICACHE-1` | ElastiCache Cluster Missing Reserved Coverage | elasticache | discovery | Implemented |
| `CLDBRN-AWS-ELASTICACHE-2` | ElastiCache Cluster Idle              | elasticache | discovery | Implemented |
| `CLDBRN-AWS-ELB-1`    | Application Load Balancer Without Targets | elb     | discovery      | Implemented |
| `CLDBRN-AWS-ELB-2`    | Classic Load Balancer Without Instances   | elb     | discovery      | Implemented |
| `CLDBRN-AWS-ELB-3`    | Gateway Load Balancer Without Targets     | elb     | discovery      | Implemented |
| `CLDBRN-AWS-ELB-4`    | Network Load Balancer Without Targets     | elb     | discovery      | Implemented |
| `CLDBRN-AWS-ELB-5`    | Load Balancer Idle                        | elb     | discovery      | Implemented |
| `CLDBRN-AWS-EMR-1`    | EMR Cluster Previous Generation Instance Types | emr | discovery | Implemented |
| `CLDBRN-AWS-EMR-2`    | EMR Cluster Idle                          | emr     | discovery      | Implemented |
| `CLDBRN-AWS-RDS-1`    | RDS Instance Class Not Preferred          | rds     | iac, discovery | Implemented |
| `CLDBRN-AWS-RDS-2`    | RDS DB Instance Idle                      | rds     | discovery      | Implemented |
| `CLDBRN-AWS-RDS-3`    | RDS DB Instance Missing Reserved Coverage | rds     | discovery      | Implemented |
| `CLDBRN-AWS-RDS-4`    | RDS DB Instance Without Graviton          | rds     | discovery      | Implemented |
| `CLDBRN-AWS-RDS-5`    | RDS DB Instance Low CPU Utilization       | rds     | discovery      | Implemented |
| `CLDBRN-AWS-RDS-6`    | RDS DB Instance Unsupported Engine Version | rds    | discovery      | Implemented |
| `CLDBRN-AWS-RDS-7`    | RDS Snapshot Without Source DB Instance   | rds     | discovery      | Implemented |
| `CLDBRN-AWS-REDSHIFT-1` | Redshift Cluster Low CPU Utilization    | redshift | discovery     | Implemented |
| `CLDBRN-AWS-REDSHIFT-2` | Redshift Cluster Missing Reserved Coverage | redshift | discovery   | Implemented |
| `CLDBRN-AWS-REDSHIFT-3` | Redshift Cluster Pause Resume Not Enabled | redshift | discovery    | Implemented |
| `CLDBRN-AWS-ROUTE53-1` | Route 53 Record Higher TTL              | route53 | discovery      | Implemented |
| `CLDBRN-AWS-ROUTE53-2` | Route 53 Health Check Unused            | route53 | discovery      | Implemented |
| `CLDBRN-AWS-S3-1`     | S3 Missing Lifecycle Configuration        | s3      | iac, discovery | Implemented |
| `CLDBRN-AWS-S3-2`     | S3 Bucket Storage Class Not Optimized     | s3      | iac, discovery | Implemented |
| `CLDBRN-AWS-SECRETSMANAGER-1` | Secrets Manager Secret Unused    | secretsmanager | discovery | Implemented |
| `CLDBRN-AWS-LAMBDA-1` | Lambda Cost Optimal Architecture          | lambda  | iac, discovery | Implemented |
| `CLDBRN-AWS-LAMBDA-2` | Lambda Function High Error Rate           | lambda  | discovery      | Implemented |
| `CLDBRN-AWS-LAMBDA-3` | Lambda Function Excessive Timeout         | lambda  | discovery      | Implemented |
| `CLDBRN-AWS-LAMBDA-4` | Lambda Function Memory Overprovisioned    | lambda  | discovery      | Implemented |

`CLDBRN-AWS-APIGATEWAY-1` flags REST API stages when `cacheClusterEnabled` is not explicitly `true`.

`CLDBRN-AWS-CLOUDFRONT-1` reviews only distributions using `PriceClass_All`.

`CLDBRN-AWS-CLOUDFRONT-2` requires a complete 30-day `Requests` history and flags only distributions whose total request count stays below `100`.

`CLDBRN-AWS-EBS-1` flags previous-generation EBS volume types (`gp2`, `io1`, and `standard`) and does not flag current-generation HDD families such as `st1` or `sc1`.

`CLDBRN-AWS-EBS-4` treats volumes above `100 GiB` as oversized enough to warrant explicit review.

`CLDBRN-AWS-EBS-5` flags only `io1` and `io2` volumes whose provisioned IOPS exceed `32000`.

`CLDBRN-AWS-EBS-6` flags only `io1` and `io2` volumes at `16000` IOPS or below, using an IOPS-only gp3 eligibility heuristic without throughput checks.

`CLDBRN-AWS-EBS-7` flags only `completed` snapshots with a parsed `StartTime` older than `90` days.

`CLDBRN-AWS-CLOUDWATCH-2` flags log streams with no observed event history and log streams whose `lastIngestionTime` is more than 90 days old. Delivery-managed log groups remain exempt.

`CLDBRN-AWS-CLOUDWATCH-3` reviews only log groups storing at least `1 GiB` and flags them when no metric filters are configured.

`CLDBRN-AWS-COSTGUARDRAILS-1` flags accounts whose AWS Budgets summary reports zero configured budgets.

`CLDBRN-AWS-COSTGUARDRAILS-2` flags accounts whose Cost Anomaly Detection summary reports zero anomaly monitors.

`CLDBRN-AWS-COSTEXPLORER-1` compares the last two full months and flags only services with an existing prior-month baseline and a cost increase greater than `10` cost units.

`CLDBRN-AWS-DYNAMODB-1` flags only tables whose parsed `latestStreamLabel` is older than `90` days. Tables without a stream label are skipped.

`CLDBRN-AWS-DYNAMODB-2` reviews only provisioned-capacity tables and flags them when no table-level read or write autoscaling targets are configured.

`CLDBRN-AWS-DYNAMODB-3` reviews only provisioned-capacity tables and flags them when 30 days of consumed read and write capacity both sum to zero.

`CLDBRN-AWS-EC2-6` flags only families with a curated Graviton-equivalent path. Instances without architecture metadata or outside the curated family set are skipped.

`CLDBRN-AWS-EC2-7` reviews only active reserved instances with an `endTime` inside the next 60 days.

`CLDBRN-AWS-EC2-8` treats `2xlarge` and above, plus `metal`, as the large-instance review threshold.

`CLDBRN-AWS-EC2-9` flags only instances with a parsed launch timestamp at least 180 days old.

`CLDBRN-AWS-ECS-1` flags only EC2-backed container instances whose instance families have a curated Graviton-equivalent path. Fargate and unclassified backing instances are skipped.

`CLDBRN-AWS-ECS-2` flags only ECS clusters with a complete 14-day `AWS/ECS` CPU history and an average below `10%`.

`CLDBRN-AWS-ECS-3` flags only active `REPLICA` ECS services and requires both a scalable target and at least one scaling policy.

`CLDBRN-AWS-EKS-1` flags only managed node groups with classifiable non-Arm instance families. Arm AMIs and unclassified node groups are skipped.

`CLDBRN-AWS-ELASTICACHE-1` reviews only `available` clusters with a parsed create time at least 180 days old and requires active reserved-node capacity on the same node type, preferring exact engine matches when ElastiCache reports them.

`CLDBRN-AWS-ELASTICACHE-2` currently supports Redis and Valkey clusters, requires a complete 14-day metric history, and flags only `available` clusters whose computed hit rate stays below `5%` while average current connections stay below `2`.

`CLDBRN-AWS-ELB-1`, `CLDBRN-AWS-ELB-3`, and `CLDBRN-AWS-ELB-4` flag load balancers with no attached target groups or no registered targets across attached target groups.

`CLDBRN-AWS-ELB-5` requires a complete 14-day `RequestCount` history, treats fewer than `10` requests per day as idle, and skips load balancers already covered by the stricter empty-target cleanup rules.

`CLDBRN-AWS-EMR-1` reuses the built-in EC2 family policy. EMR clusters are flagged when any discovered cluster instance type falls into the current non-preferred, previous-generation family set.

`CLDBRN-AWS-EMR-2` flags only active clusters whose `IsIdle` metric stays true for six consecutive 5-minute periods, which is a 30-minute idle window.

`CLDBRN-AWS-LAMBDA-2` uses 7-day CloudWatch totals and flags only functions whose observed `Errors / Invocations` ratio is greater than `10%`.

`CLDBRN-AWS-LAMBDA-3` reviews only functions with configured timeouts of at least `30` seconds and flags when the timeout is at least `5x` the observed 7-day average duration.

`CLDBRN-AWS-LAMBDA-4` reviews only functions configured above `256 MB`, requires invocation history, and flags them when the observed 7-day average duration uses less than `30%` of the configured timeout.

`CLDBRN-AWS-RDS-3` reviews only `available` DB instances with a parsed create time at least 180 days old and requires active reserved-instance coverage on the same instance class, deployment mode, and normalized engine when AWS reports it.

`CLDBRN-AWS-RDS-4` flags only curated non-Graviton RDS families with a clear Graviton migration path. Existing Graviton classes and unclassified families are skipped.

`CLDBRN-AWS-RDS-5` reviews only `available` DB instances and treats a complete 30-day average `CPUUtilization` of `10%` or lower as low utilization.

`CLDBRN-AWS-RDS-6` flags only RDS MySQL `5.7.x` and PostgreSQL `11.x` DB instances for extended-support review.

`CLDBRN-AWS-RDS-7` flags only snapshots whose source DB instance no longer exists and whose parsed create time is at least `30` days old.

`CLDBRN-AWS-REDSHIFT-1` reviews only `available` clusters and treats a 14-day average `CPUUtilization` of 10% or lower as low utilization.

`CLDBRN-AWS-REDSHIFT-2` reviews only `available` clusters with a parsed create time at least 180 days old and requires active reserved-node coverage for the same node type.

`CLDBRN-AWS-REDSHIFT-3` flags only `available`, VPC-backed clusters with automated snapshots enabled, no HSM, and no Multi-AZ deployment when either the pause or resume schedule is missing.

`CLDBRN-AWS-ROUTE53-1` reviews only non-alias records and treats `3600` seconds as the low-TTL floor.

`CLDBRN-AWS-ROUTE53-2` flags only Route 53 health checks that are not referenced by any discovered record set.

`CLDBRN-AWS-SECRETSMANAGER-1` flags secrets with no `lastAccessedDate` and secrets whose parsed last access is at least `90` days old.

**Status key:**

- **Implemented** — has evaluator coverage for every scan mode listed in `supports`
- **Scaffold** — metadata defined, no evaluator implementations yet

## Presets

| Preset ID  | Name     | Rule IDs            |
| ---------- | -------- | ------------------- |
| `aws-core` | AWS Core | All AWS rules above |

Future presets (planned): `strict`, `startup`, `production`.
