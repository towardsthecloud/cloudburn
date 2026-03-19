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
| `CLDBRN-AWS-EC2-9`    | EC2 Instance Without Graviton             | ec2     | discovery      | Implemented |
| `CLDBRN-AWS-EC2-10`   | EC2 Reserved Instance Expiring            | ec2     | discovery      | Implemented |
| `CLDBRN-AWS-EC2-11`   | EC2 Instance Large Size                   | ec2     | discovery      | Implemented |
| `CLDBRN-AWS-EC2-12`   | EC2 Instance Long Running                 | ec2     | discovery      | Implemented |
| `CLDBRN-AWS-ECS-1`    | ECS Container Instance Without Graviton   | ecs     | discovery      | Implemented |
| `CLDBRN-AWS-ECS-2`    | ECS Cluster Low CPU Utilization           | ecs     | discovery      | Implemented |
| `CLDBRN-AWS-ECS-3`    | ECS Service Missing Autoscaling Policy    | ecs     | discovery      | Implemented |
| `CLDBRN-AWS-EBS-1`    | EBS Volume Type Not Current Generation    | ebs     | discovery, iac | Implemented |
| `CLDBRN-AWS-EBS-2`    | EBS Volume Unattached                     | ebs     | discovery      | Implemented |
| `CLDBRN-AWS-EBS-3`    | EBS Volume Attached To Stopped Instances  | ebs     | discovery      | Implemented |
| `CLDBRN-AWS-ECR-1`    | ECR Repository Missing Lifecycle Policy   | ecr     | iac, discovery | Implemented |
| `CLDBRN-AWS-EKS-1`    | EKS Node Group Without Graviton           | eks     | discovery      | Implemented |
| `CLDBRN-AWS-ELASTICACHE-1` | ElastiCache Cluster Missing Reserved Coverage | elasticache | discovery | Implemented |
| `CLDBRN-AWS-ELB-1`    | Application Load Balancer Without Targets | elb     | discovery      | Implemented |
| `CLDBRN-AWS-ELB-2`    | Classic Load Balancer Without Instances   | elb     | discovery      | Implemented |
| `CLDBRN-AWS-ELB-3`    | Gateway Load Balancer Without Targets     | elb     | discovery      | Implemented |
| `CLDBRN-AWS-EMR-1`    | EMR Cluster Previous Generation Instance Types | emr | discovery | Implemented |
| `CLDBRN-AWS-EMR-2`    | EMR Cluster Idle                          | emr     | discovery      | Implemented |
| `CLDBRN-AWS-RDS-1`    | RDS Instance Class Not Preferred          | rds     | iac, discovery | Implemented |
| `CLDBRN-AWS-RDS-2`    | RDS DB Instance Idle                      | rds     | discovery      | Implemented |
| `CLDBRN-AWS-REDSHIFT-1` | Redshift Cluster Low CPU Utilization    | redshift | discovery     | Implemented |
| `CLDBRN-AWS-REDSHIFT-2` | Redshift Cluster Missing Reserved Coverage | redshift | discovery   | Implemented |
| `CLDBRN-AWS-REDSHIFT-3` | Redshift Cluster Pause Resume Not Enabled | redshift | discovery    | Implemented |
| `CLDBRN-AWS-S3-1`     | S3 Missing Lifecycle Configuration        | s3      | iac, discovery | Implemented |
| `CLDBRN-AWS-S3-2`     | S3 Bucket Storage Class Not Optimized     | s3      | iac, discovery | Implemented |
| `CLDBRN-AWS-LAMBDA-1` | Lambda Cost Optimal Architecture          | lambda  | iac, discovery | Implemented |

`CLDBRN-AWS-EBS-1` flags previous-generation EBS volume types (`gp2`, `io1`, and `standard`) and does not flag current-generation HDD families such as `st1` or `sc1`.

`CLDBRN-AWS-CLOUDWATCH-2` flags only log streams with no observed event history. Streams with older events are not treated as unused by this rule.

`CLDBRN-AWS-EC2-9` flags only families with a curated Graviton-equivalent path. Instances without architecture metadata or outside the curated family set are skipped.

`CLDBRN-AWS-EC2-10` reviews only active reserved instances with an `endTime` inside the next 60 days.

`CLDBRN-AWS-EC2-11` treats `2xlarge` and above, plus `metal`, as the large-instance review threshold.

`CLDBRN-AWS-EC2-12` flags only instances with a parsed launch timestamp at least 180 days old.

`CLDBRN-AWS-ECS-1` flags only EC2-backed container instances whose instance families have a curated Graviton-equivalent path. Fargate and unclassified backing instances are skipped.

`CLDBRN-AWS-ECS-2` flags only ECS clusters with a complete 14-day `AWS/ECS` CPU history and an average below `10%`.

`CLDBRN-AWS-ECS-3` flags only active `REPLICA` ECS services and requires both a scalable target and at least one scaling policy.

`CLDBRN-AWS-EKS-1` flags only managed node groups with classifiable non-Arm instance families. Arm AMIs and unclassified node groups are skipped.

`CLDBRN-AWS-ELASTICACHE-1` reviews only `available` clusters with a parsed create time at least 180 days old and requires active reserved-node capacity on the same node type, preferring exact engine matches when ElastiCache reports them.

`CLDBRN-AWS-ELB-1` and `CLDBRN-AWS-ELB-3` flag load balancers with no attached target groups or no registered targets across attached target groups.

`CLDBRN-AWS-EMR-1` reuses the built-in EC2 family policy. EMR clusters are flagged when any discovered cluster instance type falls into the current non-preferred, previous-generation family set.

`CLDBRN-AWS-EMR-2` flags only active clusters whose `IsIdle` metric stays true for six consecutive 5-minute periods, which is a 30-minute idle window.

`CLDBRN-AWS-REDSHIFT-1` reviews only `available` clusters and treats a 14-day average `CPUUtilization` of 10% or lower as low utilization.

`CLDBRN-AWS-REDSHIFT-2` reviews only `available` clusters with a parsed create time at least 180 days old and requires active reserved-node coverage for the same node type.

`CLDBRN-AWS-REDSHIFT-3` flags only `available`, VPC-backed clusters with automated snapshots enabled, no HSM, and no Multi-AZ deployment when either the pause or resume schedule is missing.

**Status key:**

- **Implemented** — has evaluator coverage for every scan mode listed in `supports`
- **Scaffold** — metadata defined, no evaluator implementations yet

## Presets

| Preset ID  | Name     | Rule IDs            |
| ---------- | -------- | ------------------- |
| `aws-core` | AWS Core | All AWS rules above |

Future presets (planned): `strict`, `startup`, `production`.
