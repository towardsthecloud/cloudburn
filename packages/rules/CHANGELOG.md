# @cloudburn/rules

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
