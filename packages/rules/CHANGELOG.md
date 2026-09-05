# @cloudburn/rules

## 0.32.1

### Patch Changes

- [#220](https://github.com/towardsthecloud/cloudburn/pull/220) [`43677ed`](https://github.com/towardsthecloud/cloudburn/commit/43677ed95a2231b580a90a6f2406c3f11e8366a4) Thanks [@axonstone](https://github.com/axonstone)! - Join Redshift and EMR metric evidence by account, region, and cluster identifier so same-named resources do not inherit another resource’s findings.

  Index load-balancer target groups once per rule evaluation to avoid repeated fleet-wide lookups.

## 0.32.0

### Minor Changes

- [#217](https://github.com/towardsthecloud/cloudburn/pull/217) [`7a69c3a`](https://github.com/towardsthecloud/cloudburn/commit/7a69c3aeddc7810a4b9dc44400efdf4fbbed93e3) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add opt-in Cost Optimization Hub rightsizing rule CLDBRN-AWS-COSTOPTIMIZATIONHUB-4 and typed current/recommended configurations for 8 resource types. Direct Lambda memory findings suppress matching Hub duplicates.

- [#218](https://github.com/towardsthecloud/cloudburn/pull/218) [`e83ad0f`](https://github.com/towardsthecloud/cloudburn/commit/e83ad0f9d8e850f82bf5f62e83897be6788dcbaa) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add opt-in CLDBRN-AWS-COSTOPTIMIZATIONHUB-6 for AWS-recommended Graviton migrations with typed configuration and workload compatibility evidence.

- [#216](https://github.com/towardsthecloud/cloudburn/pull/216) [`4a5f31b`](https://github.com/towardsthecloud/cloudburn/commit/4a5f31be22c859869f34f44277a7f4b972256c63) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add opt-in CLDBRN-AWS-COSTOPTIMIZATIONHUB-3 for AWS-classified idle capacity, with typed action-specific evidence. Add action and resource namespace to unattached EBS findings for exact duplicate suppression.

- [#219](https://github.com/towardsthecloud/cloudburn/pull/219) [`629f912`](https://github.com/towardsthecloud/cloudburn/commit/629f9126aa70fd717670e8d60c84de31547944e7) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add opt-in CLDBRN-AWS-COSTOPTIMIZATIONHUB-5 for product-generation upgrades with typed current and recommended configurations. Give native EBS and RDS storage generation findings distinct resource namespaces for duplicate suppression.

### Patch Changes

- [#214](https://github.com/towardsthecloud/cloudburn/pull/214) [`4246560`](https://github.com/towardsthecloud/cloudburn/commit/4246560ab4913b22bbf3ea968eef173b4f81d175) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Detect available Transit Gateway VPC attachments with no traffic during a complete 30-day window and include public regional attachment pricing when available.

- [#215](https://github.com/towardsthecloud/cloudburn/pull/215) [`e265e3b`](https://github.com/towardsthecloud/cloudburn/commit/e265e3b040e3aaa0fe414d86453114d72e6bafe5) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add opt-in Cost Optimization Hub reservation purchase findings with typed evidence, shared read-only loading, and rule-declared native-finding precedence.

- [#207](https://github.com/towardsthecloud/cloudburn/pull/207) [`8f40c21`](https://github.com/towardsthecloud/cloudburn/commit/8f40c218170c6f3c7892247d501e6699fa211f33) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Report Compute, EC2 Instance, and SageMaker Savings Plans purchase recommendations from Cost Optimization Hub, and flag material SageMaker Savings Plans coverage gaps from Cost Explorer without duplicate findings.

## 0.31.0

### Minor Changes

- [#206](https://github.com/towardsthecloud/cloudburn/pull/206) [`bda6f2d`](https://github.com/towardsthecloud/cloudburn/commit/bda6f2d06907316904cf242add3477d2e89a6593) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add `CLDBRN-AWS-KMS-1` to flag Regions with at least 50 enabled customer-managed KMS keys or at least 10 created during the previous full month. Add `CLDBRN-AWS-KMS-2` to flag enabled customer-managed keys that are at least 90 days old and have no recorded KMS cryptographic use during a complete 90-day tracking window. Both rules share one KMS discovery scan, keep raw aliases private, and surface incomplete metadata without treating it as proof that a key is unused.

### Patch Changes

- [#204](https://github.com/towardsthecloud/cloudburn/pull/204) [`cb8da02`](https://github.com/towardsthecloud/cloudburn/commit/cb8da02f764975f9a9ff98905e586c1b2b72aa85) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add a discovery check that recommends targeted daily AWS Config recording overrides when current inventory, recent resource turnover, and configuration-item volume show a saving. Keep continuous recording for Firewall Manager dependencies, and report inconclusive turnover inspection as unavailable when it could change the finding decision.

## 0.30.1

### Patch Changes

- [#202](https://github.com/towardsthecloud/cloudburn/pull/202) [`a5d4329`](https://github.com/towardsthecloud/cloudburn/commit/a5d43294f0a4f7062b54e6d411dd334f57f79a4a) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Keep readable DynamoDB tables when individual metadata calls are denied, preserve actionable Resource Explorer setup errors, and base Lambda memory and DynamoDB inactivity findings on valid AWS usage evidence. Lambda memory recommendations are now opt-in because they require AWS Compute Optimizer enrollment.

## 0.30.0

### Minor Changes

- [#195](https://github.com/towardsthecloud/cloudburn/pull/195) [`af4c97d`](https://github.com/towardsthecloud/cloudburn/commit/af4c97d64426c3172f63be984162d72b7815fe81) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Run the ECR lifecycle policy content rules during live discovery by normalizing tagged and untagged retention coverage from each repository policy.

## 0.29.0

### Minor Changes

- [#166](https://github.com/towardsthecloud/cloudburn/pull/166) [`783e67c`](https://github.com/towardsthecloud/cloudburn/commit/783e67cb0e1da3a6938f6667a6f54c10d4ba9763) Thanks [@axonstone](https://github.com/axonstone)! - Remove four heuristic AWS rules that could flag valid cost choices without usage evidence: disabled API Gateway caching, missing CloudWatch metric filters, configured Lambda provisioned concurrency, and ungated S3 Intelligent-Tiering. Default scans no longer report those findings, and the unused provider datasets are no longer loaded or exported.

- [#179](https://github.com/towardsthecloud/cloudburn/pull/179) [`442bf8b`](https://github.com/towardsthecloud/cloudburn/commit/442bf8b120b9cbe8788b7bb964100023ba6420c8) Thanks [@axonstone](https://github.com/axonstone)! - Add an AWS cost guardrail that flags budgets forecast to breach their limit before actual spend exceeds it.

## 0.28.0

### Minor Changes

- [#164](https://github.com/towardsthecloud/cloudburn/pull/164) [`5fa14dc`](https://github.com/towardsthecloud/cloudburn/commit/5fa14dc0ffe090c4d2d0ff2ccbb4f73344beb12b) Thanks [@axonstone](https://github.com/axonstone)! - Add optional discovery evaluation evidence with normalized resource identities, complete rule metadata, and explicit
  triggered, passed, or not-applicable outcomes for generic SDK consumers.

## 0.27.0

### Minor Changes

- [#161](https://github.com/towardsthecloud/cloudburn/pull/161) [`2b7f011`](https://github.com/towardsthecloud/cloudburn/commit/2b7f01139c6fcbc51761370ca5785f0ddebec5ce) Thanks [@axonstone](https://github.com/axonstone)! - Add opt-in live rule evaluation evidence so SDK consumers can report which resources passed each discovery check.

## 0.26.0

### Minor Changes

- [#135](https://github.com/towardsthecloud/cloudburn/pull/135) [`375f489`](https://github.com/towardsthecloud/cloudburn/commit/375f489a05a22b78373e4c38062f5dd8f8916f66) Thanks [@axonstone](https://github.com/axonstone)! - Add three storage and node generation rules: CLDBRN-AWS-S3-5 recommends Intelligent-Tiering for buckets with no lifecycle configuration, CLDBRN-AWS-RDS-11 flags DB instances on gp2 or magnetic storage, and CLDBRN-AWS-ELASTICACHE-3 flags clusters on previous-generation cache node families.

## 0.25.0

### Minor Changes

- [#133](https://github.com/towardsthecloud/cloudburn/pull/133) [`f3b9ab3`](https://github.com/towardsthecloud/cloudburn/commit/f3b9ab37f36d8e4690de2018a57ac291e0d9d82d) Thanks [@axonstone](https://github.com/axonstone)! - Add required high, medium, or low severity metadata to every rule and finding so consumers can prioritize cost policies consistently.

## 0.24.0

### Minor Changes

- [#71](https://github.com/towardsthecloud/cloudburn/pull/71) [`ec078bc`](https://github.com/towardsthecloud/cloudburn/commit/ec078bc33e208812b6ce5898d7046987cb8da41f) Thanks [@axonstone](https://github.com/axonstone)! - Add an exceeded-budget rule and an opt-in global untagged-resource rule with their public discovery dataset contracts.

## 0.23.0

### Minor Changes

- [#62](https://github.com/towardsthecloud/cloudburn/pull/62) [`4d25e80`](https://github.com/towardsthecloud/cloudburn/commit/4d25e80b65edbff1eb556896973b1032a9319255) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add AWS discovery rules for stopped EC2 instances, old manual RDS snapshots, and idle SageMaker endpoints.

## 0.22.0

### Minor Changes

- [#60](https://github.com/towardsthecloud/cloudburn/pull/60) [`e1d241f`](https://github.com/towardsthecloud/cloudburn/commit/e1d241f0d50b4a3acc3e1facf5b633005e13415d) Thanks [@axonstone](https://github.com/axonstone)! - Add discovery rules that flag stopped Amazon RDS DB instances and recently expired EC2 reserved instances for review.

## 0.21.1

### Patch Changes

- [#55](https://github.com/towardsthecloud/cloudburn/pull/55) [`becbfa3`](https://github.com/towardsthecloud/cloudburn/commit/becbfa39f352be0f1ad33585af199ad55e2ebe69) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Redesign `CLDBRN-AWS-CLOUDWATCH-2` to flag inactive CloudWatch log groups from latest stream activity summaries instead of enumerating every log stream.

## 0.21.0

### Minor Changes

- [#52](https://github.com/towardsthecloud/cloudburn/pull/52) [`8cd3b28`](https://github.com/towardsthecloud/cloudburn/commit/8cd3b28794555b0a876830b55e77ce21622fa581) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add new AWS IaC cost review rules for versioned S3 cleanup, ECR lifecycle quality, gp3 tuning, EC2 detailed monitoring, DynamoDB autoscaling ranges, Lambda provisioned concurrency, and RDS Performance Insights retention, and extend ECS and Redshift rules to support IaC.

### Patch Changes

- [#53](https://github.com/towardsthecloud/cloudburn/pull/53) [`b59a9f3`](https://github.com/towardsthecloud/cloudburn/commit/b59a9f3b0f2ae04894095cf79d3b070e61e1fbb6) Thanks [@axonstone](https://github.com/axonstone)! - Add built-in AWS discovery rules for idle NAT gateways and running SageMaker notebook instances.

## 0.20.0

### Minor Changes

- [#49](https://github.com/towardsthecloud/cloudburn/pull/49) [`0a91238`](https://github.com/towardsthecloud/cloudburn/commit/0a9123845a9c7486415d50fb2ee466b4b4095c04) Thanks [@axonstone](https://github.com/axonstone)! - Add new AWS discovery cost rules for Lambda memory overprovisioning, CloudWatch log groups without metric filters, DynamoDB unused tables, missing AWS cost guardrails, idle load balancers, unused CloudFront distributions, and idle ElastiCache clusters.

- [#50](https://github.com/towardsthecloud/cloudburn/pull/50) [`e9b3176`](https://github.com/towardsthecloud/cloudburn/commit/e9b317658e97cc11670b0fc962eed3d08f0368d5) Thanks [@axonstone](https://github.com/axonstone)! - Add an S3 rule for buckets missing lifecycle cleanup for incomplete multipart uploads within 7 days across IaC and discovery.

- [#48](https://github.com/towardsthecloud/cloudburn/pull/48) [`c5da62e`](https://github.com/towardsthecloud/cloudburn/commit/c5da62e474f04daedaea58cc26a46082dc18cbd6) Thanks [@axonstone](https://github.com/axonstone)! - Add IaC evaluation support for high-confidence AWS rules covering EBS sizing and IOPS checks, EC2 instance and Elastic IP reviews, RDS Graviton and engine-version checks, API Gateway stages, CloudFront price classes, CloudWatch log retention, DynamoDB autoscaling, EKS node groups, EMR instance generations, and Route 53 TTL and health-check usage.

## 0.19.0

### Minor Changes

- [#47](https://github.com/towardsthecloud/cloudburn/pull/47) [`f44751b`](https://github.com/towardsthecloud/cloudburn/commit/f44751b57e30beec44eea85fd28d911544f38ce6) Thanks [@axonstone](https://github.com/axonstone)! - Add AWS discovery rules for API Gateway stage caching, CloudFront price class review, Cost Explorer month-over-month increases, DynamoDB stale tables and autoscaling coverage, Route 53 TTL and unused health checks, and unused Secrets Manager secrets.

- [#45](https://github.com/towardsthecloud/cloudburn/pull/45) [`9413ce1`](https://github.com/towardsthecloud/cloudburn/commit/9413ce138cf0bdf5ed95e7231a796e884692831e) Thanks [@axonstone](https://github.com/axonstone)! - Add new AWS discovery rules for unused Network Load Balancers, Lambda error-rate and timeout review, and RDS reserved coverage, Graviton review, low CPU utilization, unsupported engine versions, and orphaned snapshots.

## 0.18.0

### Minor Changes

- [#42](https://github.com/towardsthecloud/cloudburn/pull/42) [`58b7ff0`](https://github.com/towardsthecloud/cloudburn/commit/58b7ff07e307ebdcd67b9689c04904789dd765a1) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add discovery-only AWS EBS rules for large volumes, high-IOPS io1/io2 volumes, low-IOPS gp3 review candidates, and old snapshots.

## 0.17.2

### Patch Changes

- [#40](https://github.com/towardsthecloud/cloudburn/pull/40) [`a5d9bd4`](https://github.com/towardsthecloud/cloudburn/commit/a5d9bd44ed280d8226a6657f49af19dfba16f36a) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Renumber the AWS EC2 built-in rule IDs to keep the service sequence contiguous and add metadata coverage that fails when rule numbers are duplicated or skipped.

## 0.17.1

### Patch Changes

- [#38](https://github.com/towardsthecloud/cloudburn/pull/38) [`b46ad3b`](https://github.com/towardsthecloud/cloudburn/commit/b46ad3b7d483b5a1176b42e115da0be97afc2c3c) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Flag CloudWatch unused log streams when they have never received events or when their last ingestion was more than 90 days ago.

## 0.17.0

### Minor Changes

- [#70](https://github.com/towardsthecloud/cloudburn/pull/70) [`86973af`](https://github.com/towardsthecloud/cloudburn/commit/86973af86fa232b34de2c84db1b044d7e08d4872) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add AWS discovery rules for ElastiCache reserved coverage, EMR instance and idle review, and Redshift utilization, reserved coverage, and pause/resume review.

## 0.16.0

### Minor Changes

- [#66](https://github.com/towardsthecloud/cloudburn/pull/66) [`2bd5361`](https://github.com/towardsthecloud/cloudburn/commit/2bd53619cb89f2dbb911e83319993e57632c9b44) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add AWS ECS and EKS discovery rules for Graviton review, low ECS cluster CPU utilization, and missing ECS autoscaling policies.

- [#64](https://github.com/towardsthecloud/cloudburn/pull/64) [`6c5ede0`](https://github.com/towardsthecloud/cloudburn/commit/6c5ede0afdf5ee0f1eff46a7092731a86ecebea0) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add discovery-only EC2 and ELB cleanup rules for Graviton review, reserved instance renewal review, large and long-running instances, and empty load balancers.

## 0.15.0

### Minor Changes

- [#63](https://github.com/towardsthecloud/cloudburn/pull/63) [`dc32229`](https://github.com/towardsthecloud/cloudburn/commit/dc32229f8703c590e70da30970312548b7aa25a1) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add discovery-only AWS CloudTrail and CloudWatch rules for redundant trails, missing log-group retention, and unused log streams.

- [#59](https://github.com/towardsthecloud/cloudburn/pull/59) [`02a6583`](https://github.com/towardsthecloud/cloudburn/commit/02a6583e7b84250746e89a3378d97985b13f4c82) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Rename the exported scan-mode type from `ScanSource` to `Source` in the public rule metadata contracts.

### Patch Changes

- [#62](https://github.com/towardsthecloud/cloudburn/pull/62) [`f0dc39c`](https://github.com/towardsthecloud/cloudburn/commit/f0dc39cf1385832efb5c6a4aa51a997c946eb4cf) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Broaden the EBS current-generation rule to cover previous-generation `io1` and `standard` volumes, and add discovery rules for unattached EBS volumes and EBS volumes attached only to stopped EC2 instances.

## 0.14.0

### Minor Changes

- [#55](https://github.com/towardsthecloud/cloudburn/pull/55) [`c25f3cd`](https://github.com/towardsthecloud/cloudburn/commit/c25f3cda250f1e6f558d1c65137cdade9f556640) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add new AWS cost rules for missing ECR lifecycle policies, unassociated Elastic IPs, inactive interface VPC endpoints, idle RDS DB instances, and low-utilization EC2 instances.

## 0.13.2

### Patch Changes

- [#50](https://github.com/towardsthecloud/cloudburn/pull/50) [`e44707c`](https://github.com/towardsthecloud/cloudburn/commit/e44707cf0a0c25e0addbad9fc0de4556ecdb475f) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Refresh the npm README with clearer docs for built-in rule packs and custom rule authoring.

## 0.13.1

### Patch Changes

- [#46](https://github.com/towardsthecloud/cloudburn/pull/46) [`3839f9b`](https://github.com/towardsthecloud/cloudburn/commit/3839f9b0ea143984426caba4b53f7ae46abfbde8) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Rename rule source location fields from `startLine` and `startColumn` to `line` and `column`.

## 0.13.0

### Minor Changes

- [#44](https://github.com/towardsthecloud/cloudburn/pull/44) [`de903f2`](https://github.com/towardsthecloud/cloudburn/commit/de903f25fac295271b4d2c5457d48e0b7fd3c20d) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add discovery support for `CLDBRN-AWS-RDS-1` so the preferred RDS instance-class policy now evaluates live RDS DB instances as well as Terraform and CloudFormation resources.

## 0.12.0

### Minor Changes

- [#41](https://github.com/towardsthecloud/cloudburn/pull/41) [`1e54a6b`](https://github.com/towardsthecloud/cloudburn/commit/1e54a6b5d747d4ef08915e98122a5cd26aa75b3d) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add an IaC-only RDS preferred instance-class rule that flags curated older-generation DB instance families.

## 0.11.0

### Minor Changes

- [#37](https://github.com/towardsthecloud/cloudburn/pull/37) [`685a2c5`](https://github.com/towardsthecloud/cloudburn/commit/685a2c501e543e8d7b59b37c8aa4263d8bc4ce8a) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add discovery support to the existing S3 lifecycle and storage-class optimization rules.

## 0.10.0

### Minor Changes

- [#35](https://github.com/towardsthecloud/cloudburn/pull/35) [`267db25`](https://github.com/towardsthecloud/cloudburn/commit/267db25a3e3480d443d58a11cd3a7580646ad113) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add `staticDependencies` and `StaticResourceBag` to the rule contract so static IaC rules can consume normalized SDK datasets instead of filtering raw parsed resources.

## 0.9.0

### Minor Changes

- [#33](https://github.com/towardsthecloud/cloudburn/pull/33) [`ac6a4be`](https://github.com/towardsthecloud/cloudburn/commit/ac6a4be9584481e7e887b8b5d9223a5b5494cb9b) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Refactor live rule authoring to use SDK-owned discovery dataset dependencies and a typed `LiveResourceBag` instead of rule-level `liveDiscovery` wiring and fixed context arrays.

- [#31](https://github.com/towardsthecloud/cloudburn/pull/31) [`163bab8`](https://github.com/towardsthecloud/cloudburn/commit/163bab87b4677e91b130bfcabb1e5ee6c0535079) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add static AWS cost rules for S3 lifecycle coverage, S3 storage-class optimization, and S3 interface VPC endpoints.

## 0.8.1

### Patch Changes

- [#26](https://github.com/towardsthecloud/cloudburn/pull/26) [`c474ddb`](https://github.com/towardsthecloud/cloudburn/commit/c474ddbf534190efe7dd9bb585d24ba1c503dfb1) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add an EC2 preferred-instance rule for static and discovery scans, including curated family recommendations and EC2 instance hydration support.

## 0.8.0

### Minor Changes

- [#24](https://github.com/towardsthecloud/cloudburn/pull/24) [`0bf6dc3`](https://github.com/towardsthecloud/cloudburn/commit/0bf6dc3bbda5fbb4788258fc4cdc0560156a0398) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add `liveDiscovery` rule metadata and a catalog-aware live evaluation context for Resource Explorer-backed AWS discovery.

## 0.7.0

### Minor Changes

- [#21](https://github.com/towardsthecloud/cloudburn/pull/21) [`c0a57c8`](https://github.com/towardsthecloud/cloudburn/commit/c0a57c8642c94cd46835d3b0550696f255ebff23) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Implement evaluators for CLDBRN-AWS-LAMBDA-1 (Lambda Cost-Optimal Architecture). The rule flags Lambda functions using x86_64 and recommends ARM64 (Graviton2) for ~20% cost savings. Adds `AwsLambdaFunction` type and extends `LiveEvaluationContext`.

### Patch Changes

- [#21](https://github.com/towardsthecloud/cloudburn/pull/21) [`c0a57c8`](https://github.com/towardsthecloud/cloudburn/commit/c0a57c8642c94cd46835d3b0550696f255ebff23) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Keep the Lambda architecture rule advisory by removing the hard-coded migration and price claim, and skip static findings when Lambda architectures are computed or otherwise unknown.

## 0.6.0

### Minor Changes

- [#16](https://github.com/towardsthecloud/cloudburn/pull/16) [`dee5aa0`](https://github.com/towardsthecloud/cloudburn/commit/dee5aa012f4b11da2fd4bc102f63bcdf2acc1b98) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Rename the static evaluation resource catalog to `iacResources` and let the EBS current-generation rule evaluate both Terraform and CloudFormation resources.

## 0.5.0

### Minor Changes

- [#14](https://github.com/towardsthecloud/cloudburn/pull/14) [`a16b579`](https://github.com/towardsthecloud/cloudburn/commit/a16b579bd223464a55245dd8459e6a062626d9e2) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Replace service-specific Terraform static context fields with a generic `terraformResources` catalog for static rule evaluation.

## 0.4.0

### Minor Changes

- [`9547c27`](https://github.com/towardsthecloud/cloudburn/commit/9547c273e21ba25bbb4b3567aed0129d1a3dd5e2) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Adopt the lean canonical scan contract with provider-grouped rule results, rule-level `service` / `source` / `message` fields, nested findings that omit empty optional values, and preserved Terraform source locations for IaC matches.

## 0.3.0

### Minor Changes

- [#8](https://github.com/towardsthecloud/cloudburn/pull/8) [`e45d012`](https://github.com/towardsthecloud/cloudburn/commit/e45d012297e4cd19560fb84ca8dd0fa1f6cf7a23) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add Terraform static scanning for literal EBS gp2 volumes and extend the built-in EBS current-generation rule to support both live discovery and IaC evaluation.

## 1.0.0

### Major Changes

- [#2](https://github.com/towardsthecloud/cloudburn/pull/2) [`dbe5ab2`](https://github.com/towardsthecloud/cloudburn/commit/dbe5ab21d56d803452b5b62a7d92b648942af583) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Standardize rule conventions for multi-cloud support: new CLDBRN rule ID format, ScanMode replaced by Source, severity removed, Finding.location replaced by structured ResourceLocation, rule files and exports renamed to policy-describing names.

## 0.2.0

### Minor Changes

- [#1](https://github.com/towardsthecloud/cloudburn/pull/1) [`73cd4b0`](https://github.com/towardsthecloud/cloudburn/commit/73cd4b080aaca0c6601d565ea6e7958780c8de0c) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add the first executable live AWS rule for detecting EBS gp2 volumes that should migrate to gp3.

## 0.1.0

### Minor Changes

- chore: initial public scaffold and version bump
