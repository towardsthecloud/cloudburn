# @cloudburn/sdk

## 0.22.0

### Minor Changes

- [#62](https://github.com/towardsthecloud/cloudburn/pull/62) [`4d25e80`](https://github.com/towardsthecloud/cloudburn/commit/4d25e80b65edbff1eb556896973b1032a9319255) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add AWS discovery support for EC2 stop timestamps and SageMaker endpoint activity.

### Patch Changes

- Updated dependencies [[`4d25e80`](https://github.com/towardsthecloud/cloudburn/commit/4d25e80b65edbff1eb556896973b1032a9319255)]:
  - @cloudburn/rules@0.23.0

## 0.21.2

### Patch Changes

- [#58](https://github.com/towardsthecloud/cloudburn/pull/58) [`67c3b85`](https://github.com/towardsthecloud/cloudburn/commit/67c3b850e90902e51f480ee2112a0a75544dab5c) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Gracefully degrade AWS discovery when required datasets are throttled or otherwise unavailable by retrying longer and surfacing skipped-rule diagnostics instead of aborting the run.

- Updated dependencies [[`e1d241f`](https://github.com/towardsthecloud/cloudburn/commit/e1d241f0d50b4a3acc3e1facf5b633005e13415d)]:
  - @cloudburn/rules@0.22.0

## 0.21.1

### Patch Changes

- [#55](https://github.com/towardsthecloud/cloudburn/pull/55) [`becbfa3`](https://github.com/towardsthecloud/cloudburn/commit/becbfa39f352be0f1ad33585af199ad55e2ebe69) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Reduce live discovery fan-out with batched Resource Explorer queries, add throttling-aware retries and debug tracing, and add log-group-level CloudWatch activity hydration to avoid full log-stream enumeration for stale log group checks.

- Updated dependencies [[`becbfa3`](https://github.com/towardsthecloud/cloudburn/commit/becbfa39f352be0f1ad33585af199ad55e2ebe69)]:
  - @cloudburn/rules@0.21.1

## 0.21.0

### Minor Changes

- [#52](https://github.com/towardsthecloud/cloudburn/pull/52) [`8cd3b28`](https://github.com/towardsthecloud/cloudburn/commit/8cd3b28794555b0a876830b55e77ce21622fa581) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add AWS static IaC dataset support for new cost review rules across S3, ECR, EBS, EC2, DynamoDB, ECS, Lambda, RDS, and Redshift.

### Patch Changes

- [#53](https://github.com/towardsthecloud/cloudburn/pull/53) [`b59a9f3`](https://github.com/towardsthecloud/cloudburn/commit/b59a9f3b0f2ae04894095cf79d3b070e61e1fbb6) Thanks [@axonstone](https://github.com/axonstone)! - Add AWS discovery dataset support for idle NAT gateways and running SageMaker notebook instances.

- Updated dependencies [[`8cd3b28`](https://github.com/towardsthecloud/cloudburn/commit/8cd3b28794555b0a876830b55e77ce21622fa581), [`b59a9f3`](https://github.com/towardsthecloud/cloudburn/commit/b59a9f3b0f2ae04894095cf79d3b070e61e1fbb6)]:
  - @cloudburn/rules@0.21.0

## 0.20.0

### Minor Changes

- [#50](https://github.com/towardsthecloud/cloudburn/pull/50) [`e9b3176`](https://github.com/towardsthecloud/cloudburn/commit/e9b317658e97cc11670b0fc962eed3d08f0368d5) Thanks [@axonstone](https://github.com/axonstone)! - Add shared S3 analysis support for detecting lifecycle rules that abort incomplete multipart uploads within 7 days.

- [#48](https://github.com/towardsthecloud/cloudburn/pull/48) [`c5da62e`](https://github.com/towardsthecloud/cloudburn/commit/c5da62e474f04daedaea58cc26a46082dc18cbd6) Thanks [@axonstone](https://github.com/axonstone)! - Add static AWS dataset loaders for the new dual-mode IaC rules, including DynamoDB autoscaling state, Elastic IP association state, EKS node groups, EMR cluster instance types, and Route 53 records and health checks across Terraform and CloudFormation inputs.

- [#49](https://github.com/towardsthecloud/cloudburn/pull/49) [`0a91238`](https://github.com/towardsthecloud/cloudburn/commit/0a9123845a9c7486415d50fb2ee466b4b4095c04) Thanks [@axonstone](https://github.com/axonstone)! - Add AWS discovery datasets and hydrators for Lambda memory sizing, CloudWatch log metric-filter coverage, DynamoDB table utilization, Budgets and Cost Anomaly Detection summaries, load balancer request activity, CloudFront request activity, and ElastiCache cluster activity.

### Patch Changes

- Updated dependencies [[`0a91238`](https://github.com/towardsthecloud/cloudburn/commit/0a9123845a9c7486415d50fb2ee466b4b4095c04), [`e9b3176`](https://github.com/towardsthecloud/cloudburn/commit/e9b317658e97cc11670b0fc962eed3d08f0368d5), [`c5da62e`](https://github.com/towardsthecloud/cloudburn/commit/c5da62e474f04daedaea58cc26a46082dc18cbd6)]:
  - @cloudburn/rules@0.20.0

## 0.19.0

### Minor Changes

- [#47](https://github.com/towardsthecloud/cloudburn/pull/47) [`f44751b`](https://github.com/towardsthecloud/cloudburn/commit/f44751b57e30beec44eea85fd28d911544f38ce6) Thanks [@axonstone](https://github.com/axonstone)! - Add AWS discovery loaders and registry wiring for API Gateway stages, CloudFront distributions, Cost Explorer service spend deltas, DynamoDB tables and autoscaling, Route 53 zones, records, and health checks, and Secrets Manager secrets.

- [#45](https://github.com/towardsthecloud/cloudburn/pull/45) [`9413ce1`](https://github.com/towardsthecloud/cloudburn/commit/9413ce138cf0bdf5ed95e7231a796e884692831e) Thanks [@axonstone](https://github.com/axonstone)! - Add AWS discovery datasets and hydrators for Lambda function metrics plus enriched RDS instance, reservation, CPU, and snapshot metadata needed by the new ELB, Lambda, and RDS built-in rules.

### Patch Changes

- Updated dependencies [[`f44751b`](https://github.com/towardsthecloud/cloudburn/commit/f44751b57e30beec44eea85fd28d911544f38ce6), [`9413ce1`](https://github.com/towardsthecloud/cloudburn/commit/9413ce138cf0bdf5ed95e7231a796e884692831e)]:
  - @cloudburn/rules@0.19.0

## 0.18.0

### Minor Changes

- [#42](https://github.com/towardsthecloud/cloudburn/pull/42) [`58b7ff0`](https://github.com/towardsthecloud/cloudburn/commit/58b7ff07e307ebdcd67b9689c04904789dd765a1) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add AWS discovery dataset support for richer EBS volume metadata and EBS snapshot hydration used by the new EBS discovery rules.

### Patch Changes

- Updated dependencies [[`58b7ff0`](https://github.com/towardsthecloud/cloudburn/commit/58b7ff07e307ebdcd67b9689c04904789dd765a1)]:
  - @cloudburn/rules@0.18.0

## 0.17.2

### Patch Changes

- Updated dependencies [[`a5d9bd4`](https://github.com/towardsthecloud/cloudburn/commit/a5d9bd44ed280d8226a6657f49af19dfba16f36a)]:
  - @cloudburn/rules@0.17.2

## 0.17.1

### Patch Changes

- Updated dependencies [[`b46ad3b`](https://github.com/towardsthecloud/cloudburn/commit/b46ad3b7d483b5a1176b42e115da0be97afc2c3c)]:
  - @cloudburn/rules@0.17.1

## 0.17.0

### Minor Changes

- [#70](https://github.com/towardsthecloud/cloudburn/pull/70) [`86973af`](https://github.com/towardsthecloud/cloudburn/commit/86973af86fa232b34de2c84db1b044d7e08d4872) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add AWS discovery datasets and loaders for ElastiCache, EMR, and Redshift cost checks.

### Patch Changes

- [#69](https://github.com/towardsthecloud/cloudburn/pull/69) [`5b2b05d`](https://github.com/towardsthecloud/cloudburn/commit/5b2b05da55a407a9355e00ff705675ca63902ffc) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Avoid auto-loading repository `.cloudburn.yml`/`.cloudburn.yaml` while running in CI unless an explicit config path is provided.

- [#68](https://github.com/towardsthecloud/cloudburn/pull/68) [`174948b`](https://github.com/towardsthecloud/cloudburn/commit/174948bc5cf9ad39a0a202df45bd258ec856f017) Thanks [@dannysteenman](https://github.com/dannysteenman)! - fix cloudformation parsing to skip symlinks and oversized templates during static scans

- Updated dependencies [[`86973af`](https://github.com/towardsthecloud/cloudburn/commit/86973af86fa232b34de2c84db1b044d7e08d4872)]:
  - @cloudburn/rules@0.17.0

## 0.16.0

### Minor Changes

- [#64](https://github.com/towardsthecloud/cloudburn/pull/64) [`6c5ede0`](https://github.com/towardsthecloud/cloudburn/commit/6c5ede0afdf5ee0f1eff46a7092731a86ecebea0) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add AWS discovery dataset support for reserved instances, load balancers, and target groups, and enrich discovered EC2 instances with architecture and launch time metadata.

- [#66](https://github.com/towardsthecloud/cloudburn/pull/66) [`2bd5361`](https://github.com/towardsthecloud/cloudburn/commit/2bd53619cb89f2dbb911e83319993e57632c9b44) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add AWS ECS and EKS discovery datasets, hydrators, and AWS SDK clients required by the new ECS and EKS discovery rules.

### Patch Changes

- Updated dependencies [[`2bd5361`](https://github.com/towardsthecloud/cloudburn/commit/2bd53619cb89f2dbb911e83319993e57632c9b44), [`6c5ede0`](https://github.com/towardsthecloud/cloudburn/commit/6c5ede0afdf5ee0f1eff46a7092731a86ecebea0)]:
  - @cloudburn/rules@0.16.0

## 0.15.0

### Minor Changes

- [#63](https://github.com/towardsthecloud/cloudburn/pull/63) [`dc32229`](https://github.com/towardsthecloud/cloudburn/commit/dc32229f8703c590e70da30970312548b7aa25a1) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add AWS discovery datasets and hydrators for CloudTrail trails and CloudWatch Logs log groups and log streams.

- [#59](https://github.com/towardsthecloud/cloudburn/pull/59) [`02a6583`](https://github.com/towardsthecloud/cloudburn/commit/02a6583e7b84250746e89a3378d97985b13f4c82) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add mode-local `services` config filtering for `scan` and `discover`, and rename the exported scan-mode type from `ScanSource` to `Source`.

- [#61](https://github.com/towardsthecloud/cloudburn/pull/61) [`86ef49e`](https://github.com/towardsthecloud/cloudburn/commit/86ef49e617c9ff1e1c5e7bbcb7463e67a02bb9c2) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Remove `text` from the config output-format contract. CloudBurn config now accepts only `table` or `json` for mode `format`, and existing `format: text` values fail validation.

### Patch Changes

- [#62](https://github.com/towardsthecloud/cloudburn/pull/62) [`f0dc39c`](https://github.com/towardsthecloud/cloudburn/commit/f0dc39cf1385832efb5c6a4aa51a997c946eb4cf) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Extend AWS EC2 and EBS discovery hydration so EBS volume datasets include attachment metadata and EC2 instance datasets include instance state for attachment-aware cost rules.

- Updated dependencies [[`dc32229`](https://github.com/towardsthecloud/cloudburn/commit/dc32229f8703c590e70da30970312548b7aa25a1), [`f0dc39c`](https://github.com/towardsthecloud/cloudburn/commit/f0dc39cf1385832efb5c6a4aa51a997c946eb4cf), [`02a6583`](https://github.com/towardsthecloud/cloudburn/commit/02a6583e7b84250746e89a3378d97985b13f4c82)]:
  - @cloudburn/rules@0.15.0

## 0.14.0

### Minor Changes

- [#55](https://github.com/towardsthecloud/cloudburn/pull/55) [`c25f3cd`](https://github.com/towardsthecloud/cloudburn/commit/c25f3cda250f1e6f558d1c65137cdade9f556640) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add AWS datasets and hydrators for ECR lifecycle policy discovery, Elastic IP association state, interface VPC endpoint activity, RDS idle detection, and EC2 low-utilization evaluation.

### Patch Changes

- Updated dependencies [[`c25f3cd`](https://github.com/towardsthecloud/cloudburn/commit/c25f3cda250f1e6f558d1c65137cdade9f556640)]:
  - @cloudburn/rules@0.14.0

## 0.13.3

### Patch Changes

- [#50](https://github.com/towardsthecloud/cloudburn/pull/50) [`e44707c`](https://github.com/towardsthecloud/cloudburn/commit/e44707cf0a0c25e0addbad9fc0de4556ecdb475f) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Refresh the npm README with clearer SDK docs for static scans, discovery setup, and core entrypoints.

- Updated dependencies [[`e44707c`](https://github.com/towardsthecloud/cloudburn/commit/e44707cf0a0c25e0addbad9fc0de4556ecdb475f)]:
  - @cloudburn/rules@0.13.2

## 0.13.2

### Patch Changes

- [#48](https://github.com/towardsthecloud/cloudburn/pull/48) [`e754f73`](https://github.com/towardsthecloud/cloudburn/commit/e754f73d73051d2965d5ba50559474e0362d1df5) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Fix AWS Resource Explorer discovery and initialization for local-only accounts by using the selected region as the control plane, reusing existing local indexes, and falling back to local-only setup when cross-region aggregator creation is denied.

- [#48](https://github.com/towardsthecloud/cloudburn/pull/48) [`e754f73`](https://github.com/towardsthecloud/cloudburn/commit/e754f73d73051d2965d5ba50559474e0362d1df5) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Treat AWS service access-denied errors during live discovery hydration as non-fatal diagnostics so CloudBurn can continue evaluating other datasets instead of aborting the full discover run.

## 0.13.1

### Patch Changes

- [#46](https://github.com/towardsthecloud/cloudburn/pull/46) [`3839f9b`](https://github.com/towardsthecloud/cloudburn/commit/3839f9b0ea143984426caba4b53f7ae46abfbde8) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Rename IaC source location fields from `startLine` and `startColumn` to `line` and `column` in parser and scanner results.

- Updated dependencies [[`3839f9b`](https://github.com/towardsthecloud/cloudburn/commit/3839f9b0ea143984426caba4b53f7ae46abfbde8)]:
  - @cloudburn/rules@0.13.1

## 0.13.0

### Minor Changes

- [#44](https://github.com/towardsthecloud/cloudburn/pull/44) [`de903f2`](https://github.com/towardsthecloud/cloudburn/commit/de903f25fac295271b4d2c5457d48e0b7fd3c20d) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add AWS RDS DB instance discovery hydration and registry wiring for the shared `aws-rds-instances` dataset used by the built-in RDS preferred instance-class rule.

### Patch Changes

- Updated dependencies [[`de903f2`](https://github.com/towardsthecloud/cloudburn/commit/de903f25fac295271b4d2c5457d48e0b7fd3c20d)]:
  - @cloudburn/rules@0.13.0

## 0.12.0

### Minor Changes

- [#41](https://github.com/towardsthecloud/cloudburn/pull/41) [`1e54a6b`](https://github.com/towardsthecloud/cloudburn/commit/1e54a6b5d747d4ef08915e98122a5cd26aa75b3d) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add static `aws-rds-instances` dataset loading so IaC scans can evaluate RDS DB instance class optimization rules.

- [#42](https://github.com/towardsthecloud/cloudburn/pull/42) [`6e7e1ac`](https://github.com/towardsthecloud/cloudburn/commit/6e7e1accc9aa3a58bb0d08a4dea7c63d9d7e0c67) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add real `.cloudburn.yml` and `.cloudburn.yaml` support with mode-specific `iac` and `discovery` config, explicit config-path loading, and mode-aware rule filtering.

### Patch Changes

- Updated dependencies [[`1e54a6b`](https://github.com/towardsthecloud/cloudburn/commit/1e54a6b5d747d4ef08915e98122a5cd26aa75b3d)]:
  - @cloudburn/rules@0.12.0

## 0.11.0

### Minor Changes

- [#37](https://github.com/towardsthecloud/cloudburn/pull/37) [`685a2c5`](https://github.com/towardsthecloud/cloudburn/commit/685a2c501e543e8d7b59b37c8aa4263d8bc4ce8a) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add S3 bucket discovery hydration for lifecycle and intelligent-tiering based optimization rules.

### Patch Changes

- Updated dependencies [[`685a2c5`](https://github.com/towardsthecloud/cloudburn/commit/685a2c501e543e8d7b59b37c8aa4263d8bc4ce8a)]:
  - @cloudburn/rules@0.11.0

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

- [#2](https://github.com/towardsthecloud/cloudburn/pull/2) [`dbe5ab2`](https://github.com/towardsthecloud/cloudburn/commit/dbe5ab21d56d803452b5b62a7d92b648942af583) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Standardize rule conventions for multi-cloud support: new CLDBRN rule ID format, ScanMode replaced by Source, severity removed, Finding.location replaced by structured ResourceLocation, rule files and exports renamed to policy-describing names.

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
