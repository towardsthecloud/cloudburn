# @cloudburn/sdk

## 0.10.0

### Minor Changes

- [#35](https://github.com/towardsthecloud/cloudburn/pull/35) [`267db25`](https://github.com/towardsthecloud/cloudburn/commit/267db25a3e3480d443d58a11cd3a7580646ad113) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Refactor static IaC scanning to use SDK-owned dataset registries and `StaticResourceBag`, so new static rules can be added without expanding the scan engine.

### Patch Changes

- Updated dependencies [[`267db25`](https://github.com/towardsthecloud/cloudburn/commit/267db25a3e3480d443d58a11cd3a7580646ad113)]:
  - @cloudburn/rules@0.10.0

## 0.9.0

### Minor Changes

- [#31](https://github.com/towardsthecloud/cloudburn/pull/31) [`163bab8`](https://github.com/towardsthecloud/cloudburn/commit/163bab87b4677e91b130bfcabb1e5ee6c0535079) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Refresh SDK-exposed built-in rule metadata to include the new S3 and EC2 cost optimization rules and updated S3 scan-mode support.

- [#33](https://github.com/towardsthecloud/cloudburn/pull/33) [`ac6a4be`](https://github.com/towardsthecloud/cloudburn/commit/ac6a4be9584481e7e887b8b5d9223a5b5494cb9b) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Refactor AWS live discovery to a registry-driven dataset orchestration flow and rename the provider orchestration module to `discovery.ts`.

### Patch Changes

- Updated dependencies [[`ac6a4be`](https://github.com/towardsthecloud/cloudburn/commit/ac6a4be9584481e7e887b8b5d9223a5b5494cb9b), [`163bab8`](https://github.com/towardsthecloud/cloudburn/commit/163bab87b4677e91b130bfcabb1e5ee6c0535079)]:
  - @cloudburn/rules@0.9.0

## 0.8.2

### Patch Changes

- [#29](https://github.com/towardsthecloud/cloudburn/pull/29) [`b734230`](https://github.com/towardsthecloud/cloudburn/commit/b734230a2151e5e6d4d366e1fa36bc408a7de1c8) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Expose built-in rule metadata through the SDK and enrich `cloudburn rules list` to group rules by provider and service.

  `cloudburn rules list` now shows `RULE_ID: description` in human-readable output and returns rule metadata objects in JSON instead of bare rule ID strings.

## 0.8.1

### Patch Changes

- [#26](https://github.com/towardsthecloud/cloudburn/pull/26) [`c474ddb`](https://github.com/towardsthecloud/cloudburn/commit/c474ddbf534190efe7dd9bb585d24ba1c503dfb1) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add an EC2 preferred-instance rule for static and discovery scans, including curated family recommendations and EC2 instance hydration support.

- Updated dependencies [[`c474ddb`](https://github.com/towardsthecloud/cloudburn/commit/c474ddbf534190efe7dd9bb585d24ba1c503dfb1)]:
  - @cloudburn/rules@0.8.1

## 0.8.0

### Minor Changes

- [#24](https://github.com/towardsthecloud/cloudburn/pull/24) [`0bf6dc3`](https://github.com/towardsthecloud/cloudburn/commit/0bf6dc3bbda5fbb4788258fc4cdc0560156a0398) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Route live AWS discovery through AWS Resource Explorer catalogs plus targeted hydrators, expose discovery setup and introspection helpers on `CloudBurnClient`, remove the legacy `scanLive()` / `live.*` compatibility surface, require discovery rules to declare `liveDiscovery`, and fail fast on missing or filtered default Resource Explorer views.

### Patch Changes

- Updated dependencies [[`0bf6dc3`](https://github.com/towardsthecloud/cloudburn/commit/0bf6dc3bbda5fbb4788258fc4cdc0560156a0398)]:
  - @cloudburn/rules@0.8.0

## 0.7.0

### Minor Changes

- [#21](https://github.com/towardsthecloud/cloudburn/pull/21) [`c0a57c8`](https://github.com/towardsthecloud/cloudburn/commit/c0a57c8642c94cd46835d3b0550696f255ebff23) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add Lambda function discoverer using `paginateListFunctions` and wire `lambdaFunctions` into the AWS scanner's `LiveEvaluationContext`.

### Patch Changes

- [#21](https://github.com/towardsthecloud/cloudburn/pull/21) [`c0a57c8`](https://github.com/towardsthecloud/cloudburn/commit/c0a57c8642c94cd46835d3b0550696f255ebff23) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Run AWS live discoverers concurrently, degrade to partial results when individual discoverers or Lambda regions fail, and add focused Lambda discovery coverage for normalization and live-scan findings.

- Updated dependencies [[`c0a57c8`](https://github.com/towardsthecloud/cloudburn/commit/c0a57c8642c94cd46835d3b0550696f255ebff23), [`c0a57c8`](https://github.com/towardsthecloud/cloudburn/commit/c0a57c8642c94cd46835d3b0550696f255ebff23)]:
  - @cloudburn/rules@0.7.0

## 0.6.1

### Patch Changes

- [#19](https://github.com/towardsthecloud/cloudburn/pull/19) [`231a7b0`](https://github.com/towardsthecloud/cloudburn/commit/231a7b06d4acfe34f3d2fd749fd118c71c6a0483) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Expose `parseIaC` from the SDK package root as a public autodetect parser helper for Terraform and CloudFormation inputs.

## 0.6.0

### Minor Changes

- [#16](https://github.com/towardsthecloud/cloudburn/pull/16) [`dee5aa0`](https://github.com/towardsthecloud/cloudburn/commit/dee5aa012f4b11da2fd4bc102f63bcdf2acc1b98) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add CloudFormation static parsing and aggregate Terraform and CloudFormation resources through a shared static IaC scan path.

### Patch Changes

- Updated dependencies [[`dee5aa0`](https://github.com/towardsthecloud/cloudburn/commit/dee5aa012f4b11da2fd4bc102f63bcdf2acc1b98)]:
  - @cloudburn/rules@0.6.0

## 0.5.0

### Minor Changes

- [#14](https://github.com/towardsthecloud/cloudburn/pull/14) [`a16b579`](https://github.com/towardsthecloud/cloudburn/commit/a16b579bd223464a55245dd8459e6a062626d9e2) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Generalize Terraform parsing to extract all AWS `resource` blocks into a shared static resource catalog for rule evaluation.

### Patch Changes

- Updated dependencies [[`a16b579`](https://github.com/towardsthecloud/cloudburn/commit/a16b579bd223464a55245dd8459e6a062626d9e2)]:
  - @cloudburn/rules@0.5.0

## 0.4.0

### Minor Changes

- [`9547c27`](https://github.com/towardsthecloud/cloudburn/commit/9547c273e21ba25bbb4b3567aed0129d1a3dd5e2) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Adopt the lean canonical scan contract with provider-grouped rule results, rule-level `service` / `source` / `message` fields, nested findings that omit empty optional values, and preserved Terraform source locations for IaC matches.

### Patch Changes

- Updated dependencies [[`9547c27`](https://github.com/towardsthecloud/cloudburn/commit/9547c273e21ba25bbb4b3567aed0129d1a3dd5e2)]:
  - @cloudburn/rules@0.4.0

## 0.3.0

### Minor Changes

- [#8](https://github.com/towardsthecloud/cloudburn/pull/8) [`e45d012`](https://github.com/towardsthecloud/cloudburn/commit/e45d012297e4cd19560fb84ca8dd0fa1f6cf7a23) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add Terraform static scanning for literal EBS gp2 volumes and extend the built-in EBS current-generation rule to support both live discovery and IaC evaluation.

### Patch Changes

- Updated dependencies [[`e45d012`](https://github.com/towardsthecloud/cloudburn/commit/e45d012297e4cd19560fb84ca8dd0fa1f6cf7a23)]:
  - @cloudburn/rules@0.3.0

## 1.0.0

### Major Changes

- [#2](https://github.com/towardsthecloud/cloudburn/pull/2) [`dbe5ab2`](https://github.com/towardsthecloud/cloudburn/commit/dbe5ab21d56d803452b5b62a7d92b648942af583) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Standardize rule conventions for multi-cloud support: new CLDBRN rule ID format, ScanMode replaced by ScanSource, severity removed, Finding.location replaced by structured ResourceLocation, rule files and exports renamed to policy-describing names.

### Patch Changes

- Updated dependencies [[`dbe5ab2`](https://github.com/towardsthecloud/cloudburn/commit/dbe5ab21d56d803452b5b62a7d92b648942af583)]:
  - @cloudburn/rules@1.0.0

## 0.2.0

### Minor Changes

- [#1](https://github.com/towardsthecloud/cloudburn/pull/1) [`73cd4b0`](https://github.com/towardsthecloud/cloudburn/commit/73cd4b080aaca0c6601d565ea6e7958780c8de0c) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add the first executable live AWS rule for detecting EBS gp2 volumes that should migrate to gp3.

### Patch Changes

- Updated dependencies [[`73cd4b0`](https://github.com/towardsthecloud/cloudburn/commit/73cd4b080aaca0c6601d565ea6e7958780c8de0c)]:
  - @cloudburn/rules@0.2.0

## 0.1.0

### Minor Changes

- chore: initial public scaffold and version bump

### Patch Changes

- Updated dependencies []:
  - @cloudburn/rules@0.1.0
