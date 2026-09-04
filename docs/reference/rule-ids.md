# Rule ID Reference

Source of truth: rule files in `packages/rules/src/aws/`.

## ID Convention

Format: `CLDBRN-{PROVIDER}-{SERVICE}-{N}`

- All uppercase
- No zero-padding on the sequence number
- IDs stay contiguous within each provider/service sequence; when a change affects the sequence, renumber later entries and update references in the same change
- Provider: `AWS`, `AZURE`, `GCP`
- Service: short name matching the directory (e.g. `EBS`, `EC2`, `RDS`, `S3`, `LAMBDA`)

The metadata test in `packages/rules/test/rule-metadata.test.ts` currently enforces uniqueness and a gap-free numeric
sequence for every provider/service pair.

## Presets

- `aws-core` is the default general discovery preset.
- `CLDBRN-AWS-LAMBDA-4` is opt-in because AWS Compute Optimizer requires account enrollment. Enable it with `cloudburn discover --enabled-rules CLDBRN-AWS-LAMBDA-4` or `config.discovery.enabledRules` in the SDK.
- `CLDBRN-AWS-TAGGING-1` is opt-in because account-wide tagging needs an accessible Resource Explorer aggregator.
- Applications can define product-specific rule selections with `config.discovery.enabledRules`. Such selections are
  application policy rather than SDK presets; the SDK continues to return the same generic findings and evaluation
  evidence for any selected discovery rules.

## Compatibility Status

Rule IDs are public configuration and result references. The repository currently enforces contiguous service sequences,
including renumbering later entries when rules are removed or reordered. That policy conflicts with treating each ID as an
immutable cross-release identifier. The long-term public-stability contract remains a maintainer decision.

Until that decision is resolved, follow the enforced contiguous policy, treat any renumbering as a user-visible migration,
and update all repository references together. Do not renumber IDs as part of unrelated maintenance.

## Rule Table

Severity communicates relative cost impact: `high` covers the largest or most immediate cost risks, `medium` covers
meaningful optimization opportunities, and `low` covers hygiene and smaller accumulation risks. Use
`cloudburn rules list --severity <level>` to filter the catalog.

| ID                            | Severity | Description                                                                                                                                                                                                                         | Service        | Supports       |
| ----------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------- |
| `CLDBRN-AWS-CLOUDFRONT-1`     | medium   | Reviews only distributions using `PriceClass_All`.                                                                                                                                                                                  | cloudfront     | discovery, iac |
| `CLDBRN-AWS-CLOUDFRONT-2`     | medium   | Requires a complete 30-day `Requests` history and flags only distributions whose total request count stays below `100`.                                                                                                             | cloudfront     | discovery      |
| `CLDBRN-AWS-CLOUDTRAIL-1`     | medium   | Flag redundant multi-region CloudTrail trails when more than one trail covers the same account.                                                                                                                                     | cloudtrail     | discovery      |
| `CLDBRN-AWS-CLOUDTRAIL-2`     | medium   | Flag redundant single-region CloudTrail trails when more than one trail covers the same region.                                                                                                                                     | cloudtrail     | discovery      |
| `CLDBRN-AWS-CLOUDWATCH-1`     | low      | Flag CloudWatch log groups that do not define retention and are not delivery-managed.                                                                                                                                               | cloudwatch     | discovery, iac |
| `CLDBRN-AWS-CLOUDWATCH-2`     | low      | Flags log groups whose most recent observed stream activity is missing or older than 90 days. Delivery-managed log groups remain exempt.                                                                                            | cloudwatch     | discovery      |
| `CLDBRN-AWS-CONFIG-1`         | medium   | Flags continuously recorded resource types when a targeted daily override is estimated to save more than `$10` monthly and no continuous dependency applies.                                                                        | config         | discovery      |
| `CLDBRN-AWS-COSTGUARDRAILS-1` | low      | Flags accounts whose AWS Budgets summary reports zero configured budgets.                                                                                                                                                           | costguardrails | discovery      |
| `CLDBRN-AWS-COSTGUARDRAILS-2` | low      | Flags accounts whose Cost Anomaly Detection summary reports zero anomaly monitors.                                                                                                                                                  | costguardrails | discovery      |
| `CLDBRN-AWS-COSTGUARDRAILS-3` | high     | Flags configured AWS Budgets only when normalized actual spend is strictly greater than the same-unit budget limit. Malformed and unit-mismatched spend details are skipped.                                                        | costguardrails | discovery      |
| `CLDBRN-AWS-COSTGUARDRAILS-4` | medium   | Flags configured AWS Budgets when normalized forecasted spend strictly exceeds the same-unit budget limit while actual spend has not exceeded it. Missing, malformed, and unit-mismatched forecasts are skipped.                    | costguardrails | discovery      |
| `CLDBRN-AWS-COSTEXPLORER-1`   | medium   | Compares the last two full months and flags only services with an existing prior-month baseline and a cost increase greater than `10` cost units.                                                                                   | costexplorer   | discovery      |
| `CLDBRN-AWS-KMS-1`            | medium   | Flags Regions with at least `50` enabled customer-managed KMS keys or at least `10` such keys created during the previous full month. AWS-managed, AWS-owned, disabled, and pending-deletion keys are excluded.                     | kms            | discovery      |
| `CLDBRN-AWS-DYNAMODB-1`       | medium   | Flags tables old enough for a complete `90`-day observation window when consumed write capacity remains `0` throughout that window.                                                                                                 | dynamodb       | discovery      |
| `CLDBRN-AWS-DYNAMODB-2`       | medium   | Reviews only provisioned-capacity tables and flags them when no table-level read or write autoscaling targets are configured.                                                                                                       | dynamodb       | discovery, iac |
| `CLDBRN-AWS-DYNAMODB-3`       | high     | Reviews only provisioned-capacity tables and flags them when 30 days of consumed read and write capacity both sum to zero.                                                                                                          | dynamodb       | discovery      |
| `CLDBRN-AWS-DYNAMODB-4`       | medium   | Reviews only provisioned-capacity tables and flags them when statically resolved read or write autoscaling ranges have identical min and max capacity values.                                                                       | dynamodb       | iac            |
| `CLDBRN-AWS-EC2-1`            | medium   | Flag direct EC2 instances that do not use curated preferred instance types.                                                                                                                                                         | ec2            | iac, discovery |
| `CLDBRN-AWS-EC2-2`            | medium   | Flag S3 interface endpoints when a gateway endpoint is the cheaper in-VPC option.                                                                                                                                                   | ec2            | iac            |
| `CLDBRN-AWS-EC2-3`            | low      | Flag Elastic IP allocations that are not associated with an EC2 resource.                                                                                                                                                           | ec2            | discovery, iac |
| `CLDBRN-AWS-EC2-4`            | medium   | Flag interface VPC endpoints that have processed no traffic in the last 30 days.                                                                                                                                                    | ec2            | discovery      |
| `CLDBRN-AWS-EC2-5`            | high     | Flag EC2 instances whose CPU and network usage stay below the low-utilization threshold for at least 4 of the previous 14 days.                                                                                                     | ec2            | discovery      |
| `CLDBRN-AWS-EC2-6`            | medium   | Flags only families with a curated Graviton-equivalent path. Instances without architecture metadata or outside the curated family set are skipped.                                                                                 | ec2            | discovery, iac |
| `CLDBRN-AWS-EC2-7`            | medium   | Reviews only active reserved instances with an `endTime` inside the next 60 days.                                                                                                                                                   | ec2            | discovery      |
| `CLDBRN-AWS-EC2-8`            | high     | Treats `2xlarge` and above, plus `metal`, as the large-instance review threshold.                                                                                                                                                   | ec2            | discovery, iac |
| `CLDBRN-AWS-EC2-9`            | medium   | Flags only instances with a parsed launch timestamp at least 180 days old.                                                                                                                                                          | ec2            | discovery      |
| `CLDBRN-AWS-EC2-10`           | low      | Flags IaC-defined instances only when detailed monitoring is explicitly enabled.                                                                                                                                                    | ec2            | iac            |
| `CLDBRN-AWS-EC2-11`           | high     | Flags only NAT gateways in the `available` state and requires complete 7-day `BytesInFromDestination` and `BytesOutToDestination` coverage, with both totals equal to `0`.                                                          | ec2            | discovery      |
| `CLDBRN-AWS-EC2-12`           | medium   | Flags only EC2 reserved instances whose `endTime` fell within the last 30 days, surfacing them for renewal follow-up review.                                                                                                        | ec2            | discovery      |
| `CLDBRN-AWS-EC2-13`           | high     | Flags only EC2 instances whose discovered state is `stopped` and whose parsed stop timestamp is at least `30` days old. Instances with missing or unparseable stop timestamps are skipped.                                          | ec2            | discovery      |
| `CLDBRN-AWS-ECS-1`            | medium   | Flags only EC2-backed container instances whose instance families have a curated Graviton-equivalent path. Fargate and unclassified backing instances are skipped.                                                                  | ecs            | discovery      |
| `CLDBRN-AWS-ECS-2`            | high     | Flags only ECS clusters with a complete 14-day `AWS/ECS` CPU history and an average below `10%`.                                                                                                                                    | ecs            | discovery      |
| `CLDBRN-AWS-ECS-3`            | medium   | Flags only active `REPLICA` ECS services and requires both a scalable target and at least one scaling policy.                                                                                                                       | ecs            | discovery, iac |
| `CLDBRN-AWS-EBS-1`            | medium   | Flags previous-generation EBS volume types (`gp2`, `io1`, and `standard`) and does not flag current-generation HDD families such as `st1` or `sc1`.                                                                                 | ebs            | discovery, iac |
| `CLDBRN-AWS-EBS-2`            | medium   | Flag EBS volumes that are not attached to any EC2 instance.                                                                                                                                                                         | ebs            | discovery      |
| `CLDBRN-AWS-EBS-3`            | high     | Flag EBS volumes whose attached EC2 instances are all in the stopped state.                                                                                                                                                         | ebs            | discovery      |
| `CLDBRN-AWS-EBS-4`            | high     | Treats volumes above `100 GiB` as oversized enough to warrant explicit review.                                                                                                                                                      | ebs            | discovery, iac |
| `CLDBRN-AWS-EBS-5`            | high     | Flags only `io1` and `io2` volumes whose provisioned IOPS exceed `32000`.                                                                                                                                                           | ebs            | discovery, iac |
| `CLDBRN-AWS-EBS-6`            | medium   | Flags only `io1` and `io2` volumes at `16000` IOPS or below, using an IOPS-only gp3 eligibility heuristic without throughput checks.                                                                                                | ebs            | discovery, iac |
| `CLDBRN-AWS-EBS-7`            | medium   | Flags only `completed` snapshots with a parsed `StartTime` older than `90` days.                                                                                                                                                    | ebs            | discovery      |
| `CLDBRN-AWS-EBS-8`            | medium   | Flags only `gp3` volumes whose provisioned throughput is above the included `125 MiB/s` baseline.                                                                                                                                   | ebs            | iac            |
| `CLDBRN-AWS-EBS-9`            | medium   | Flags only `gp3` volumes whose provisioned or defaulted IOPS exceed the included `3000` baseline.                                                                                                                                   | ebs            | iac            |
| `CLDBRN-AWS-ECR-1`            | low      | Flag ECR repositories that do not define a lifecycle policy.                                                                                                                                                                        | ecr            | iac, discovery |
| `CLDBRN-AWS-ECR-2`            | low      | Reviews only repositories with a lifecycle policy and flags them when the parsed policy does not expire untagged images.                                                                                                            | ecr            | iac, discovery |
| `CLDBRN-AWS-ECR-3`            | low      | Reviews only repositories with a lifecycle policy and flags them when the parsed policy does not cap tagged image retention.                                                                                                        | ecr            | iac, discovery |
| `CLDBRN-AWS-EKS-1`            | medium   | Flags only managed node groups with classifiable non-Arm instance families. Arm AMIs and unclassified node groups are skipped.                                                                                                      | eks            | discovery, iac |
| `CLDBRN-AWS-ELASTICACHE-1`    | medium   | Reviews only `available` clusters with a parsed create time at least 180 days old and requires active reserved-node capacity on the same node type, preferring exact engine matches when ElastiCache reports them.                  | elasticache    | discovery      |
| `CLDBRN-AWS-ELASTICACHE-2`    | high     | Currently supports Redis and Valkey clusters, requires a complete 14-day metric history, and flags only `available` clusters whose computed hit rate stays below `5%` while average current connections stay below `2`.             | elasticache    | discovery      |
| `CLDBRN-AWS-ELASTICACHE-3`    | medium   | Flags clusters on curated previous-generation cache node families such as `cache.m4` and `cache.r4`. Discovery reviews only `available` clusters, and IaC resources with an unresolved node type are skipped.                       | elasticache    | discovery, iac |
| `CLDBRN-AWS-ELB-1`            | medium   | Flags load balancers with no attached target groups or no registered targets across attached target groups.                                                                                                                         | elb            | discovery      |
| `CLDBRN-AWS-ELB-2`            | medium   | Flag Classic Load Balancers that have zero attached instances.                                                                                                                                                                      | elb            | discovery      |
| `CLDBRN-AWS-ELB-3`            | medium   | Flags load balancers with no attached target groups or no registered targets across attached target groups.                                                                                                                         | elb            | discovery      |
| `CLDBRN-AWS-ELB-4`            | medium   | Flags load balancers with no attached target groups or no registered targets across attached target groups.                                                                                                                         | elb            | discovery      |
| `CLDBRN-AWS-ELB-5`            | medium   | Requires a complete 14-day `RequestCount` history, treats fewer than `10` requests per day as idle, and skips load balancers already covered by the stricter empty-target cleanup rules.                                            | elb            | discovery      |
| `CLDBRN-AWS-EMR-1`            | medium   | Reuses the built-in EC2 family policy. EMR clusters are flagged when any discovered cluster instance type falls into the current non-preferred, previous-generation family set.                                                     | emr            | discovery, iac |
| `CLDBRN-AWS-EMR-2`            | high     | Flags only active clusters whose `IsIdle` metric stays true for six consecutive 5-minute periods, which is a 30-minute idle window.                                                                                                 | emr            | discovery      |
| `CLDBRN-AWS-RDS-1`            | medium   | Flag RDS DB instances that do not use curated preferred instance classes.                                                                                                                                                           | rds            | iac, discovery |
| `CLDBRN-AWS-RDS-2`            | high     | Flag RDS DB instances that have no database connections in the last 7 days.                                                                                                                                                         | rds            | discovery      |
| `CLDBRN-AWS-RDS-3`            | high     | Reviews only `available` DB instances with a parsed create time at least 180 days old and requires active reserved-instance coverage on the same instance class, deployment mode, and normalized engine when AWS reports it.        | rds            | discovery      |
| `CLDBRN-AWS-RDS-4`            | medium   | Flags only curated non-Graviton RDS families with a clear Graviton migration path. Existing Graviton classes and unclassified families are skipped.                                                                                 | rds            | discovery, iac |
| `CLDBRN-AWS-RDS-5`            | high     | Reviews only `available` DB instances and treats a complete 30-day average `CPUUtilization` of `10%` or lower as low utilization.                                                                                                   | rds            | discovery      |
| `CLDBRN-AWS-RDS-6`            | high     | Flags only RDS MySQL `5.7.x` and PostgreSQL `11.x` DB instances for extended-support review.                                                                                                                                        | rds            | discovery, iac |
| `CLDBRN-AWS-RDS-7`            | medium   | Flags only snapshots whose source DB instance no longer exists and whose parsed create time is at least `30` days old.                                                                                                              | rds            | discovery      |
| `CLDBRN-AWS-RDS-8`            | low      | Flags only DB instances with Performance Insights enabled and a retention period above the included 7-day baseline.                                                                                                                 | rds            | iac            |
| `CLDBRN-AWS-RDS-9`            | high     | Flags only RDS DB instances whose discovered `dbInstanceStatus` is `stopped`, surfacing them for cleanup review.                                                                                                                    | rds            | discovery      |
| `CLDBRN-AWS-RDS-10`           | medium   | Flags only manual RDS snapshots whose parsed `snapshotCreateTime` is at least `90` days old. Automated snapshots and snapshots with invalid timestamps are skipped.                                                                 | rds            | discovery      |
| `CLDBRN-AWS-RDS-11`           | medium   | Flags DB instances whose storage type is `gp2` or `standard`. Provisioned IOPS types are skipped because gp3 cannot always match their IOPS, and IaC resources that leave the storage type unresolved or unset are skipped.         | rds            | discovery, iac |
| `CLDBRN-AWS-REDSHIFT-1`       | high     | Reviews only `available` clusters and treats a 14-day average `CPUUtilization` of 10% or lower as low utilization.                                                                                                                  | redshift       | discovery      |
| `CLDBRN-AWS-REDSHIFT-2`       | high     | Reviews only `available` clusters with a parsed create time at least 180 days old and requires active reserved-node coverage for the same node type.                                                                                | redshift       | discovery      |
| `CLDBRN-AWS-REDSHIFT-3`       | high     | Flags only `available`, VPC-backed clusters with automated snapshots enabled, no HSM, and no Multi-AZ deployment when either the pause or resume schedule is missing.                                                               | redshift       | discovery, iac |
| `CLDBRN-AWS-ROUTE53-1`        | low      | Reviews only non-alias records and treats `3600` seconds as the low-TTL floor.                                                                                                                                                      | route53        | discovery, iac |
| `CLDBRN-AWS-ROUTE53-2`        | low      | Flags only Route 53 health checks that are not referenced by any in-scope record set.                                                                                                                                               | route53        | discovery, iac |
| `CLDBRN-AWS-S3-1`             | medium   | Ensure S3 buckets define lifecycle management policies.                                                                                                                                                                             | s3             | iac, discovery |
| `CLDBRN-AWS-S3-2`             | medium   | Recommend Intelligent-Tiering or another explicit storage-class transition for lifecycle-managed buckets.                                                                                                                           | s3             | iac, discovery |
| `CLDBRN-AWS-S3-3`             | low      | Flags buckets when no enabled lifecycle rule aborts incomplete multipart uploads within 7 days.                                                                                                                                     | s3             | iac, discovery |
| `CLDBRN-AWS-S3-4`             | medium   | Flags only versioned buckets and requires either noncurrent-version expiration or transition cleanup to avoid unbounded version growth.                                                                                             | s3             | iac            |
| `CLDBRN-AWS-SAGEMAKER-1`      | high     | Flags only notebook instances whose normalized status remains `InService`.                                                                                                                                                          | sagemaker      | discovery      |
| `CLDBRN-AWS-SAGEMAKER-2`      | high     | Flags only endpoints whose normalized status remains `InService`, whose parsed `creationTime` is at least `14` days old, and whose complete 14-day `Invocations` total stays at `0`. Endpoints with incomplete metrics are skipped. | sagemaker      | discovery      |
| `CLDBRN-AWS-SECRETSMANAGER-1` | low      | Flags secrets with no `lastAccessedDate` and secrets whose parsed last access is at least `90` days old.                                                                                                                            | secretsmanager | discovery      |
| `CLDBRN-AWS-TAGGING-1`        | low      | Opt-in. Uses an accessible Resource Explorer aggregator and `resourcetype.supports:tags tag:none` to flag taggable resources without user-created tags across the account. AWS-managed tags do not satisfy the rule.                | tagging        | discovery      |
| `CLDBRN-AWS-LAMBDA-1`         | medium   | Recommend arm64 architecture when compatible.                                                                                                                                                                                       | lambda         | iac, discovery |
| `CLDBRN-AWS-LAMBDA-2`         | low      | Uses 7-day CloudWatch totals and flags only functions whose observed `Errors / Invocations` ratio is greater than `10%`.                                                                                                            | lambda         | discovery      |
| `CLDBRN-AWS-LAMBDA-3`         | low      | Reviews only functions with configured timeouts of at least `30` seconds and flags when the timeout is at least `5x` the observed 7-day average duration.                                                                           | lambda         | discovery      |
| `CLDBRN-AWS-LAMBDA-4`         | medium   | Flags functions only when AWS Compute Optimizer returns a `MemoryOverprovisioned` recommendation.                                                                                                                                   | lambda         | discovery      |

`CLDBRN-AWS-CONFIG-1` reviews a 14-day window and uses the
[published AWS Config configuration-item prices](https://aws.amazon.com/config/pricing/): `$0.003` for continuous and
`$0.012` for daily recording. The daily projection includes current resources and resources deleted during the
observation window, with at most one daily item per resource per day. It cannot exceed the observed continuous volume.
The estimate covers recording charges only; AWS Config rule and conformance-pack evaluations are separate charges.
Types unsupported by daily recording, protected by Firewall Manager, or covered by a paid continuous service-linked
recorder remain continuous.

Turnover inspection reads at most `1,000` retained resource identities per candidate type and stops sooner when observed
deletions already erase the saving. When the bounded inspection cannot decide an otherwise eligible above-threshold
review, CloudBurn emits a diagnostic and reports the rule as `not_applicable`; an incomplete estimate cannot produce a
finding or a successful pass. Incomplete low-value or dependency-blocked reviews remain valid passes because additional
turnover cannot make them eligible.

The rule evaluates one region per discovery run. Pass an explicit single-region target to review another region;
multi-region and all-region SDK targets do not fan out AWS Config API calls.

`CLDBRN-AWS-KMS-1` counts customer-managed keys reported by Resource Explorer after `DescribeKey` confirms that each
key is enabled and is not pending deletion. Multi-Region primary and replica keys count separately because AWS bills
each one as a key. The churn window is the previous full UTC calendar month. A Region triggers at `50` enabled keys or
`10` keys created inside that window. When a resource policy denies `DescribeKey` for part of the catalog, the evidence
marks key metadata incomplete and reports the unreadable count; the enabled-key count remains the confirmed minimum.

The monthly storage estimate uses [AWS KMS public pricing](https://aws.amazon.com/kms/pricing/): `$1` per enabled
customer-managed key, plus `$1` for each of the first 2 completed rotations. If rotation history is denied, the estimate
keeps the `$1` base price and marks itself incomplete. Alias values never enter evaluation evidence. The SDK replaces
variable alias tokens, hashes the normalized pattern, and reports only repeated pattern IDs with their key counts.

KMS last-usage tracking separates keys with observed cryptographic use, keys with no KMS use since creation, keys that
predate the tracking window, and keys whose usage metadata is unavailable. The rule reports only proliferation and churn.
It does not label a key unused or recommend deletion. [AWS notes](https://docs.aws.amazon.com/kms/latest/developerguide/monitoring-keys-determining-usage.html)
that last-usage data cannot see local use of generated data keys or public asymmetric keys. AWS recommends disabling a
candidate first and monitoring CloudTrail before deletion.

## Presets

| Preset ID  | Name     | Rule IDs                                                                           |
| ---------- | -------- | ---------------------------------------------------------------------------------- |
| `aws-core` | AWS Core | All AWS rules above except opt-in `CLDBRN-AWS-LAMBDA-4` and `CLDBRN-AWS-TAGGING-1` |
