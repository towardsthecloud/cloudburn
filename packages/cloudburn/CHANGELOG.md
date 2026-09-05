# cloudburn

## 0.16.0

### Minor Changes

- [#218](https://github.com/towardsthecloud/cloudburn/pull/218) [`e83ad0f`](https://github.com/towardsthecloud/cloudburn/commit/e83ad0f9d8e850f82bf5f62e83897be6788dcbaa) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Support opt-in CLDBRN-AWS-COSTOPTIMIZATIONHUB-6 in discovery for EC2, Auto Scaling, and RDS Graviton migration recommendations.

- [#216](https://github.com/towardsthecloud/cloudburn/pull/216) [`4a5f31b`](https://github.com/towardsthecloud/cloudburn/commit/4a5f31be22c859869f34f44277a7f4b972256c63) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Expose opt-in CLDBRN-AWS-COSTOPTIMIZATIONHUB-3 in discovery for AWS Stop, Delete, and ScaleIn recommendations. Show the exact operation in table output's Action column.

- [#217](https://github.com/towardsthecloud/cloudburn/pull/217) [`7a69c3a`](https://github.com/towardsthecloud/cloudburn/commit/7a69c3aeddc7810a4b9dc44400efdf4fbbed93e3) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Make opt-in Hub rightsizing rule CLDBRN-AWS-COSTOPTIMIZATIONHUB-4 available through discover and rules list.

- [#219](https://github.com/towardsthecloud/cloudburn/pull/219) [`629f912`](https://github.com/towardsthecloud/cloudburn/commit/629f9126aa70fd717670e8d60c84de31547944e7) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Expose opt-in CLDBRN-AWS-COSTOPTIMIZATIONHUB-5 in discovery for EC2, Auto Scaling, EBS, RDS instance, and RDS storage generation upgrades.

### Patch Changes

- [#214](https://github.com/towardsthecloud/cloudburn/pull/214) [`4246560`](https://github.com/towardsthecloud/cloudburn/commit/4246560ab4913b22bbf3ea968eef173b4f81d175) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Detect available Transit Gateway VPC attachments with no traffic during a complete 30-day window and include public regional attachment pricing when available.

- [#215](https://github.com/towardsthecloud/cloudburn/pull/215) [`e265e3b`](https://github.com/towardsthecloud/cloudburn/commit/e265e3b040e3aaa0fe414d86453114d72e6bafe5) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add opt-in Cost Optimization Hub reservation purchase findings with typed evidence, shared read-only loading, and rule-declared native-finding precedence.

- [#207](https://github.com/towardsthecloud/cloudburn/pull/207) [`8f40c21`](https://github.com/towardsthecloud/cloudburn/commit/8f40c218170c6f3c7892247d501e6699fa211f33) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Report Compute, EC2 Instance, and SageMaker Savings Plans purchase recommendations from Cost Optimization Hub, and flag material SageMaker Savings Plans coverage gaps from Cost Explorer without duplicate findings.

- Updated dependencies [[`4246560`](https://github.com/towardsthecloud/cloudburn/commit/4246560ab4913b22bbf3ea968eef173b4f81d175), [`7a69c3a`](https://github.com/towardsthecloud/cloudburn/commit/7a69c3aeddc7810a4b9dc44400efdf4fbbed93e3), [`e265e3b`](https://github.com/towardsthecloud/cloudburn/commit/e265e3b040e3aaa0fe414d86453114d72e6bafe5), [`e83ad0f`](https://github.com/towardsthecloud/cloudburn/commit/e83ad0f9d8e850f82bf5f62e83897be6788dcbaa), [`4a5f31b`](https://github.com/towardsthecloud/cloudburn/commit/4a5f31be22c859869f34f44277a7f4b972256c63), [`8f40c21`](https://github.com/towardsthecloud/cloudburn/commit/8f40c218170c6f3c7892247d501e6699fa211f33), [`629f912`](https://github.com/towardsthecloud/cloudburn/commit/629f9126aa70fd717670e8d60c84de31547944e7)]:
  - @cloudburn/sdk@0.32.0

## 0.15.0

### Minor Changes

- [#206](https://github.com/towardsthecloud/cloudburn/pull/206) [`bda6f2d`](https://github.com/towardsthecloud/cloudburn/commit/bda6f2d06907316904cf242add3477d2e89a6593) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add `CLDBRN-AWS-KMS-1` to flag Regions with at least 50 enabled customer-managed KMS keys or at least 10 created during the previous full month. Add `CLDBRN-AWS-KMS-2` to flag enabled customer-managed keys that are at least 90 days old and have no recorded KMS cryptographic use during a complete 90-day tracking window. Both rules share one KMS discovery scan, keep raw aliases private, and surface incomplete metadata without treating it as proof that a key is unused.

### Patch Changes

- [#204](https://github.com/towardsthecloud/cloudburn/pull/204) [`cb8da02`](https://github.com/towardsthecloud/cloudburn/commit/cb8da02f764975f9a9ff98905e586c1b2b72aa85) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add a discovery check that recommends targeted daily AWS Config recording overrides when current inventory, recent resource turnover, and configuration-item volume show a saving. Keep continuous recording for Firewall Manager dependencies, and report inconclusive turnover inspection as unavailable when it could change the finding decision.

- Updated dependencies [[`cb8da02`](https://github.com/towardsthecloud/cloudburn/commit/cb8da02f764975f9a9ff98905e586c1b2b72aa85), [`bda6f2d`](https://github.com/towardsthecloud/cloudburn/commit/bda6f2d06907316904cf242add3477d2e89a6593)]:
  - @cloudburn/sdk@0.31.0

## 0.14.1

### Patch Changes

- [#202](https://github.com/towardsthecloud/cloudburn/pull/202) [`a5d4329`](https://github.com/towardsthecloud/cloudburn/commit/a5d43294f0a4f7062b54e6d411dd334f57f79a4a) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Keep readable DynamoDB tables when individual metadata calls are denied, preserve actionable Resource Explorer setup errors, and base Lambda memory and DynamoDB inactivity findings on valid AWS usage evidence. Lambda memory recommendations are now opt-in because they require AWS Compute Optimizer enrollment.

- Updated dependencies [[`a5d4329`](https://github.com/towardsthecloud/cloudburn/commit/a5d43294f0a4f7062b54e6d411dd334f57f79a4a)]:
  - @cloudburn/sdk@0.30.1

## 0.14.0

### Minor Changes

- [#195](https://github.com/towardsthecloud/cloudburn/pull/195) [`af4c97d`](https://github.com/towardsthecloud/cloudburn/commit/af4c97d64426c3172f63be984162d72b7815fe81) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Run the ECR lifecycle policy content rules during live discovery by normalizing tagged and untagged retention coverage from each repository policy.

### Patch Changes

- [#193](https://github.com/towardsthecloud/cloudburn/pull/193) [`31f66e6`](https://github.com/towardsthecloud/cloudburn/commit/31f66e63002484cf5bac9a954c04872c9291a4a6) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Load Secrets Manager last-access metadata through paginated `ListSecrets` calls so read-only roles can evaluate unused-secret rules without `DescribeSecret` access.

- [#196](https://github.com/towardsthecloud/cloudburn/pull/196) [`51ee56c`](https://github.com/towardsthecloud/cloudburn/commit/51ee56ce86d72cc13258d57fa44584bb4d5a6435) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Report whether AWS discovery was blocked by a service control policy or resource-based policy when the AWS error identifies the denial source.

- Updated dependencies [[`31f66e6`](https://github.com/towardsthecloud/cloudburn/commit/31f66e63002484cf5bac9a954c04872c9291a4a6), [`51ee56c`](https://github.com/towardsthecloud/cloudburn/commit/51ee56ce86d72cc13258d57fa44584bb4d5a6435), [`af4c97d`](https://github.com/towardsthecloud/cloudburn/commit/af4c97d64426c3172f63be984162d72b7815fe81)]:
  - @cloudburn/sdk@0.30.0

## 0.13.0

### Minor Changes

- [#166](https://github.com/towardsthecloud/cloudburn/pull/166) [`783e67c`](https://github.com/towardsthecloud/cloudburn/commit/783e67cb0e1da3a6938f6667a6f54c10d4ba9763) Thanks [@axonstone](https://github.com/axonstone)! - Remove four heuristic AWS rules that could flag valid cost choices without usage evidence: disabled API Gateway caching, missing CloudWatch metric filters, configured Lambda provisioned concurrency, and ungated S3 Intelligent-Tiering. Default scans no longer report those findings, and the unused provider datasets are no longer loaded or exported.

- [#179](https://github.com/towardsthecloud/cloudburn/pull/179) [`442bf8b`](https://github.com/towardsthecloud/cloudburn/commit/442bf8b120b9cbe8788b7bb964100023ba6420c8) Thanks [@axonstone](https://github.com/axonstone)! - Add an AWS cost guardrail that flags budgets forecast to breach their limit before actual spend exceeds it.

### Patch Changes

- [#191](https://github.com/towardsthecloud/cloudburn/pull/191) [`6bb5baa`](https://github.com/towardsthecloud/cloudburn/commit/6bb5baacd9b99b23f9bbdf107ba6e03394b5e321) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Mark discovery datasets unavailable when every regional load is denied, so affected rules are skipped instead of reported as passing against an empty dataset.

- [#192](https://github.com/towardsthecloud/cloudburn/pull/192) [`40bbec2`](https://github.com/towardsthecloud/cloudburn/commit/40bbec2ea82d93fc203901b0de4811a9f357c473) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Load Lambda configuration through paginated `ListFunctions` calls so read-only roles can evaluate Lambda discovery rules without `GetFunctionConfiguration` access.

- Updated dependencies [[`783e67c`](https://github.com/towardsthecloud/cloudburn/commit/783e67cb0e1da3a6938f6667a6f54c10d4ba9763), [`442bf8b`](https://github.com/towardsthecloud/cloudburn/commit/442bf8b120b9cbe8788b7bb964100023ba6420c8), [`6bb5baa`](https://github.com/towardsthecloud/cloudburn/commit/6bb5baacd9b99b23f9bbdf107ba6e03394b5e321), [`40bbec2`](https://github.com/towardsthecloud/cloudburn/commit/40bbec2ea82d93fc203901b0de4811a9f357c473)]:
  - @cloudburn/sdk@0.29.0

## 0.12.0

### Minor Changes

- [#164](https://github.com/towardsthecloud/cloudburn/pull/164) [`5fa14dc`](https://github.com/towardsthecloud/cloudburn/commit/5fa14dc0ffe090c4d2d0ff2ccbb4f73344beb12b) Thanks [@axonstone](https://github.com/axonstone)! - Add optional discovery evaluation evidence with normalized resource identities, complete rule metadata, and explicit
  triggered, passed, or not-applicable outcomes for generic SDK consumers.

### Patch Changes

- Updated dependencies [[`5fa14dc`](https://github.com/towardsthecloud/cloudburn/commit/5fa14dc0ffe090c4d2d0ff2ccbb4f73344beb12b)]:
  - @cloudburn/sdk@0.28.0

## 0.11.2

### Patch Changes

- Updated dependencies [[`2b7f011`](https://github.com/towardsthecloud/cloudburn/commit/2b7f01139c6fcbc51761370ca5785f0ddebec5ce)]:
  - @cloudburn/sdk@0.27.0

## 0.11.1

### Patch Changes

- Updated dependencies [[`375f489`](https://github.com/towardsthecloud/cloudburn/commit/375f489a05a22b78373e4c38062f5dd8f8916f66)]:
  - @cloudburn/sdk@0.26.0

## 0.11.0

### Minor Changes

- [#133](https://github.com/towardsthecloud/cloudburn/pull/133) [`f3b9ab3`](https://github.com/towardsthecloud/cloudburn/commit/f3b9ab37f36d8e4690de2018a57ac291e0d9d82d) Thanks [@axonstone](https://github.com/axonstone)! - Add severity-aware rule listing and CI gates with --fail-on, plus inline IaC suppressions that remain visible in output without failing policy checks.

### Patch Changes

- Updated dependencies [[`f3b9ab3`](https://github.com/towardsthecloud/cloudburn/commit/f3b9ab37f36d8e4690de2018a57ac291e0d9d82d)]:
  - @cloudburn/sdk@0.25.0

## 0.10.1

### Patch Changes

- Updated dependencies [[`1ad8fab`](https://github.com/towardsthecloud/cloudburn/commit/1ad8fab27ee6c2ecce5d0bcfcf93fd5efbe80c3a)]:
  - @cloudburn/sdk@0.24.1

## 0.10.0

### Minor Changes

- [#73](https://github.com/towardsthecloud/cloudburn/pull/73) [`e66ff1f`](https://github.com/towardsthecloud/cloudburn/commit/e66ff1f23eda9f77b7faa76754477c5afc58c91d) Thanks [@axonstone](https://github.com/axonstone)! - The discover command streams progress lines (catalog ready, datasets completed) to stderr on interactive terminals, and usage errors such as unknown options or invalid option arguments now exit with the runtime-error code 2 instead of colliding with the policy-violation exit code 1.

### Patch Changes

- [#71](https://github.com/towardsthecloud/cloudburn/pull/71) [`ec078bc`](https://github.com/towardsthecloud/cloudburn/commit/ec078bc33e208812b6ce5898d7046987cb8da41f) Thanks [@axonstone](https://github.com/axonstone)! - Describe AWS Core defaults and the aggregator requirement for opt-in global tagging discovery in CLI help and starter configuration.

- Updated dependencies [[`ec078bc`](https://github.com/towardsthecloud/cloudburn/commit/ec078bc33e208812b6ce5898d7046987cb8da41f), [`aff07f8`](https://github.com/towardsthecloud/cloudburn/commit/aff07f8377e49fb2f1a215e46de901415a12d71e), [`e66ff1f`](https://github.com/towardsthecloud/cloudburn/commit/e66ff1f23eda9f77b7faa76754477c5afc58c91d)]:
  - @cloudburn/sdk@0.24.0

## 0.9.13

### Patch Changes

- Updated dependencies [[`06bb5de`](https://github.com/towardsthecloud/cloudburn/commit/06bb5de0fe5f2c02dc679afe61767e282109d015)]:
  - @cloudburn/sdk@0.23.1

## 0.9.12

### Patch Changes

- Updated dependencies [[`cb7cf91`](https://github.com/towardsthecloud/cloudburn/commit/cb7cf911c1c18ecf9ae025944614e42ec44c5eb0)]:
  - @cloudburn/sdk@0.23.0

## 0.9.11

### Patch Changes

- Updated dependencies [[`4d25e80`](https://github.com/towardsthecloud/cloudburn/commit/4d25e80b65edbff1eb556896973b1032a9319255)]:
  - @cloudburn/sdk@0.22.0

## 0.9.10

### Patch Changes

- [#58](https://github.com/towardsthecloud/cloudburn/pull/58) [`67c3b85`](https://github.com/towardsthecloud/cloudburn/commit/67c3b850e90902e51f480ee2112a0a75544dab5c) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Improve discover table output by separating diagnostics into a dedicated table so skipped rules and access-denied discovery results stay readable.

- Updated dependencies [[`67c3b85`](https://github.com/towardsthecloud/cloudburn/commit/67c3b850e90902e51f480ee2112a0a75544dab5c)]:
  - @cloudburn/sdk@0.21.2

## 0.9.9

### Patch Changes

- [#55](https://github.com/towardsthecloud/cloudburn/pull/55) [`becbfa3`](https://github.com/towardsthecloud/cloudburn/commit/becbfa39f352be0f1ad33585af199ad55e2ebe69) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Restore `cloudburn discover --region` as a single-region CLI flag while keeping SDK-backed debug output streamed from the SDK and provider layers.

- Updated dependencies [[`becbfa3`](https://github.com/towardsthecloud/cloudburn/commit/becbfa39f352be0f1ad33585af199ad55e2ebe69)]:
  - @cloudburn/sdk@0.21.1

## 0.9.8

### Patch Changes

- Updated dependencies [[`8cd3b28`](https://github.com/towardsthecloud/cloudburn/commit/8cd3b28794555b0a876830b55e77ce21622fa581), [`b59a9f3`](https://github.com/towardsthecloud/cloudburn/commit/b59a9f3b0f2ae04894095cf79d3b070e61e1fbb6)]:
  - @cloudburn/sdk@0.21.0

## 0.9.7

### Patch Changes

- Updated dependencies [[`e9b3176`](https://github.com/towardsthecloud/cloudburn/commit/e9b317658e97cc11670b0fc962eed3d08f0368d5), [`c5da62e`](https://github.com/towardsthecloud/cloudburn/commit/c5da62e474f04daedaea58cc26a46082dc18cbd6), [`0a91238`](https://github.com/towardsthecloud/cloudburn/commit/0a9123845a9c7486415d50fb2ee466b4b4095c04)]:
  - @cloudburn/sdk@0.20.0

## 0.9.6

### Patch Changes

- Updated dependencies [[`f44751b`](https://github.com/towardsthecloud/cloudburn/commit/f44751b57e30beec44eea85fd28d911544f38ce6), [`9413ce1`](https://github.com/towardsthecloud/cloudburn/commit/9413ce138cf0bdf5ed95e7231a796e884692831e)]:
  - @cloudburn/sdk@0.19.0

## 0.9.5

### Patch Changes

- [#44](https://github.com/towardsthecloud/cloudburn/pull/44) [`5c1a9cb`](https://github.com/towardsthecloud/cloudburn/commit/5c1a9cb3349ab3394e164b929b0e76e992f5a908) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Replace the legacy `init` config workflow with a dedicated `config` command.

  `cloudburn config --init` now creates the starter config, `cloudburn config --print` prints the discovered config file, and `cloudburn config --print-template` prints the starter template without writing a file.

- Updated dependencies [[`58b7ff0`](https://github.com/towardsthecloud/cloudburn/commit/58b7ff07e307ebdcd67b9689c04904789dd765a1)]:
  - @cloudburn/sdk@0.18.0

## 0.9.4

### Patch Changes

- Updated dependencies []:
  - @cloudburn/sdk@0.17.2

## 0.9.3

### Patch Changes

- Updated dependencies []:
  - @cloudburn/sdk@0.17.1

## 0.9.2

### Patch Changes

- Updated dependencies [[`86973af`](https://github.com/towardsthecloud/cloudburn/commit/86973af86fa232b34de2c84db1b044d7e08d4872), [`5b2b05d`](https://github.com/towardsthecloud/cloudburn/commit/5b2b05da55a407a9355e00ff705675ca63902ffc), [`174948b`](https://github.com/towardsthecloud/cloudburn/commit/174948bc5cf9ad39a0a202df45bd258ec856f017)]:
  - @cloudburn/sdk@0.17.0

## 0.9.1

### Patch Changes

- Updated dependencies [[`6c5ede0`](https://github.com/towardsthecloud/cloudburn/commit/6c5ede0afdf5ee0f1eff46a7092731a86ecebea0), [`2bd5361`](https://github.com/towardsthecloud/cloudburn/commit/2bd53619cb89f2dbb911e83319993e57632c9b44)]:
  - @cloudburn/sdk@0.16.0

## 0.9.0

### Minor Changes

- [#59](https://github.com/towardsthecloud/cloudburn/pull/59) [`02a6583`](https://github.com/towardsthecloud/cloudburn/commit/02a6583e7b84250746e89a3378d97985b13f4c82) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Make `cloudburn rules list` default to table output, add `--service` and `--source` filters for rule inspection, and add `--service` overrides for `scan` and `discover`.

- [#61](https://github.com/towardsthecloud/cloudburn/pull/61) [`86ef49e`](https://github.com/towardsthecloud/cloudburn/commit/86ef49e617c9ff1e1c5e7bbcb7463e67a02bb9c2) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Remove CLI `text` output support so `table` is the default human-readable format and `json` is the only alternate `--format` value. `cloudburn init` and `cloudburn init config --print` still emit raw YAML by default, while explicit format overrides render as table or JSON.

### Patch Changes

- Updated dependencies [[`dc32229`](https://github.com/towardsthecloud/cloudburn/commit/dc32229f8703c590e70da30970312548b7aa25a1), [`f0dc39c`](https://github.com/towardsthecloud/cloudburn/commit/f0dc39cf1385832efb5c6a4aa51a997c946eb4cf), [`02a6583`](https://github.com/towardsthecloud/cloudburn/commit/02a6583e7b84250746e89a3378d97985b13f4c82), [`86ef49e`](https://github.com/towardsthecloud/cloudburn/commit/86ef49e617c9ff1e1c5e7bbcb7463e67a02bb9c2)]:
  - @cloudburn/sdk@0.15.0

## 0.8.6

### Patch Changes

- Updated dependencies [[`c25f3cd`](https://github.com/towardsthecloud/cloudburn/commit/c25f3cda250f1e6f558d1c65137cdade9f556640)]:
  - @cloudburn/sdk@0.14.0

## 0.8.5

### Patch Changes

- [#50](https://github.com/towardsthecloud/cloudburn/pull/50) [`e44707c`](https://github.com/towardsthecloud/cloudburn/commit/e44707cf0a0c25e0addbad9fc0de4556ecdb475f) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Refresh the npm README with clearer install and getting started docs for scan and discover.

- Updated dependencies [[`e44707c`](https://github.com/towardsthecloud/cloudburn/commit/e44707cf0a0c25e0addbad9fc0de4556ecdb475f)]:
  - @cloudburn/sdk@0.13.3

## 0.8.4

### Patch Changes

- [#51](https://github.com/towardsthecloud/cloudburn/pull/51) [`8f71a4f`](https://github.com/towardsthecloud/cloudburn/commit/8f71a4fca6f079a025c10589189aeace7c206476) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Fix the published CLI entrypoint so globally installed `cloudburn` binaries still execute when npm invokes them through a symlink.

## 0.8.3

### Patch Changes

- [#48](https://github.com/towardsthecloud/cloudburn/pull/48) [`e754f73`](https://github.com/towardsthecloud/cloudburn/commit/e754f73d73051d2965d5ba50559474e0362d1df5) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Fix Resource Explorer discovery and setup messaging for local-only AWS accounts by documenting current-region overrides, surfacing local setup status, and preserving the original AWS access-denied message in CLI errors.

- [#48](https://github.com/towardsthecloud/cloudburn/pull/48) [`e754f73`](https://github.com/towardsthecloud/cloudburn/commit/e754f73d73051d2965d5ba50559474e0362d1df5) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Clarify the `--enabled-rules` and `--disabled-rules` CLI help text so it is explicit that all rules run by default, `--enabled-rules` restricts execution to the listed IDs, and `--disabled-rules` excludes only the listed IDs.

- [#48](https://github.com/towardsthecloud/cloudburn/pull/48) [`e754f73`](https://github.com/towardsthecloud/cloudburn/commit/e754f73d73051d2965d5ba50559474e0362d1df5) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Show non-fatal live discovery service diagnostics in CLI output when CloudBurn is blocked from inspecting a service, instead of exiting before other findings can be reported.

- Updated dependencies [[`e754f73`](https://github.com/towardsthecloud/cloudburn/commit/e754f73d73051d2965d5ba50559474e0362d1df5), [`e754f73`](https://github.com/towardsthecloud/cloudburn/commit/e754f73d73051d2965d5ba50559474e0362d1df5)]:
  - @cloudburn/sdk@0.13.2

## 0.8.2

### Patch Changes

- [#46](https://github.com/towardsthecloud/cloudburn/pull/46) [`3839f9b`](https://github.com/towardsthecloud/cloudburn/commit/3839f9b0ea143984426caba4b53f7ae46abfbde8) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Wrap wide CLI table cells to terminal width, hide columns that are empty for every row, and rename scan location fields from `startLine`/`startColumn` to `line`/`column`.

- Updated dependencies [[`3839f9b`](https://github.com/towardsthecloud/cloudburn/commit/3839f9b0ea143984426caba4b53f7ae46abfbde8)]:
  - @cloudburn/sdk@0.13.1

## 0.8.1

### Patch Changes

- Updated dependencies [[`de903f2`](https://github.com/towardsthecloud/cloudburn/commit/de903f25fac295271b4d2c5457d48e0b7fd3c20d)]:
  - @cloudburn/sdk@0.13.0

## 0.8.0

### Minor Changes

- [#42](https://github.com/towardsthecloud/cloudburn/pull/42) [`6e7e1ac`](https://github.com/towardsthecloud/cloudburn/commit/6e7e1accc9aa3a58bb0d08a4dea7c63d9d7e0c67) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add `scan` and `discover` config override flags, move config scaffolding to `cloudburn init config`, and document the new CloudBurn config workflow.

### Patch Changes

- Updated dependencies [[`1e54a6b`](https://github.com/towardsthecloud/cloudburn/commit/1e54a6b5d747d4ef08915e98122a5cd26aa75b3d), [`6e7e1ac`](https://github.com/towardsthecloud/cloudburn/commit/6e7e1accc9aa3a58bb0d08a4dea7c63d9d7e0c67)]:
  - @cloudburn/sdk@0.12.0

## 0.7.0

### Minor Changes

- [#39](https://github.com/towardsthecloud/cloudburn/pull/39) [`c85a92e`](https://github.com/towardsthecloud/cloudburn/commit/c85a92eaa76e820bb6c0734ad96e22185d3079de) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add `cloudburn completion <shell>` to generate tab completion scripts for zsh, bash, and fish.

### Patch Changes

- [#40](https://github.com/towardsthecloud/cloudburn/pull/40) [`a0798c9`](https://github.com/towardsthecloud/cloudburn/commit/a0798c9e7581400a87807af34ca889792f5043bb) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Improve CLI help output with shared Cobra-style command sections, inherited global flags, and structured completion subcommands.

- Updated dependencies [[`685a2c5`](https://github.com/towardsthecloud/cloudburn/commit/685a2c501e543e8d7b59b37c8aa4263d8bc4ce8a)]:
  - @cloudburn/sdk@0.11.0

## 0.6.2

### Patch Changes

- Updated dependencies [[`267db25`](https://github.com/towardsthecloud/cloudburn/commit/267db25a3e3480d443d58a11cd3a7580646ad113)]:
  - @cloudburn/sdk@0.10.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`163bab8`](https://github.com/towardsthecloud/cloudburn/commit/163bab87b4677e91b130bfcabb1e5ee6c0535079), [`ac6a4be`](https://github.com/towardsthecloud/cloudburn/commit/ac6a4be9584481e7e887b8b5d9223a5b5494cb9b)]:
  - @cloudburn/sdk@0.9.0

## 0.6.0

### Minor Changes

- [#29](https://github.com/towardsthecloud/cloudburn/pull/29) [`b734230`](https://github.com/towardsthecloud/cloudburn/commit/b734230a2151e5e6d4d366e1fa36bc408a7de1c8) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Expose built-in rule metadata through the SDK and enrich `cloudburn rules list` to group rules by provider and service.

  `cloudburn rules list` now shows `RULE_ID: description` in human-readable output and returns rule metadata objects in JSON instead of bare rule ID strings.

- [#28](https://github.com/towardsthecloud/cloudburn/pull/28) [`bfcf54d`](https://github.com/towardsthecloud/cloudburn/commit/bfcf54df3dd005a9264ff89f013906d5f9b31b75) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Refactor the CLI output system around a global `--format` flag with `text`, `json`, and `table` output, while preserving raw YAML as the default for `cloudburn init`.

  This removes `sarif` output support from the CLI, which is a breaking change for existing integrations using `--format sarif`.

### Patch Changes

- Updated dependencies [[`b734230`](https://github.com/towardsthecloud/cloudburn/commit/b734230a2151e5e6d4d366e1fa36bc408a7de1c8)]:
  - @cloudburn/sdk@0.8.2

## 0.5.1

### Patch Changes

- [#26](https://github.com/towardsthecloud/cloudburn/pull/26) [`c474ddb`](https://github.com/towardsthecloud/cloudburn/commit/c474ddbf534190efe7dd9bb585d24ba1c503dfb1) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add an EC2 preferred-instance rule for static and discovery scans, including curated family recommendations and EC2 instance hydration support.

- Updated dependencies [[`c474ddb`](https://github.com/towardsthecloud/cloudburn/commit/c474ddbf534190efe7dd9bb585d24ba1c503dfb1)]:
  - @cloudburn/sdk@0.8.1

## 0.5.0

### Minor Changes

- [#24](https://github.com/towardsthecloud/cloudburn/pull/24) [`0bf6dc3`](https://github.com/towardsthecloud/cloudburn/commit/0bf6dc3bbda5fbb4788258fc4cdc0560156a0398) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Replace `scan --live` with a dedicated `discover` command for live AWS rule evaluation, setup, and Resource Explorer introspection, and remove the legacy live config block from the generated starter config.

### Patch Changes

- Updated dependencies [[`0bf6dc3`](https://github.com/towardsthecloud/cloudburn/commit/0bf6dc3bbda5fbb4788258fc4cdc0560156a0398)]:
  - @cloudburn/sdk@0.8.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`c0a57c8`](https://github.com/towardsthecloud/cloudburn/commit/c0a57c8642c94cd46835d3b0550696f255ebff23), [`c0a57c8`](https://github.com/towardsthecloud/cloudburn/commit/c0a57c8642c94cd46835d3b0550696f255ebff23)]:
  - @cloudburn/sdk@0.7.0

## 0.4.0

### Minor Changes

- [#18](https://github.com/towardsthecloud/cloudburn/pull/18) [`e9d6a7a`](https://github.com/towardsthecloud/cloudburn/commit/e9d6a7af1ddb47c1e7ac2508c3798d9f04e5e1f9) Thanks [@axonstone](https://github.com/axonstone)! - Inject version from package.json at build time and add structured JSON error output to stderr for runtime failures.

### Patch Changes

- [#19](https://github.com/towardsthecloud/cloudburn/pull/19) [`231a7b0`](https://github.com/towardsthecloud/cloudburn/commit/231a7b06d4acfe34f3d2fd749fd118c71c6a0483) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Clarify in the CLI help and documentation that static scans auto-detect Terraform and CloudFormation from the provided file or directory path.

- Updated dependencies [[`231a7b0`](https://github.com/towardsthecloud/cloudburn/commit/231a7b06d4acfe34f3d2fd749fd118c71c6a0483)]:
  - @cloudburn/sdk@0.6.1

## 0.3.1

### Patch Changes

- Updated dependencies [[`dee5aa0`](https://github.com/towardsthecloud/cloudburn/commit/dee5aa012f4b11da2fd4bc102f63bcdf2acc1b98)]:
  - @cloudburn/sdk@0.6.0

## 0.3.0

### Minor Changes

- [#13](https://github.com/towardsthecloud/cloudburn/pull/13) [`409f439`](https://github.com/towardsthecloud/cloudburn/commit/409f43936fac5e5380bf0f8a2866a359db0f5027) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Remove Markdown as a supported `cloudburn scan --format` value.

  This is a breaking CLI change: `cloudburn scan --format markdown` now fails as an invalid format. Use `table`, `json`, or `sarif` instead.

### Patch Changes

- Updated dependencies [[`a16b579`](https://github.com/towardsthecloud/cloudburn/commit/a16b579bd223464a55245dd8459e6a062626d9e2)]:
  - @cloudburn/sdk@0.5.0

## 0.2.0

### Minor Changes

- [`9547c27`](https://github.com/towardsthecloud/cloudburn/commit/9547c273e21ba25bbb4b3567aed0129d1a3dd5e2) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Adopt the lean canonical scan contract with provider-grouped rule results, rule-level `service` / `source` / `message` fields, nested findings that omit empty optional values, and preserved Terraform source locations for IaC matches.

### Patch Changes

- Updated dependencies [[`9547c27`](https://github.com/towardsthecloud/cloudburn/commit/9547c273e21ba25bbb4b3567aed0129d1a3dd5e2)]:
  - @cloudburn/sdk@0.4.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`e45d012`](https://github.com/towardsthecloud/cloudburn/commit/e45d012297e4cd19560fb84ca8dd0fa1f6cf7a23)]:
  - @cloudburn/sdk@0.3.0

## 1.0.0

### Major Changes

- [#2](https://github.com/towardsthecloud/cloudburn/pull/2) [`dbe5ab2`](https://github.com/towardsthecloud/cloudburn/commit/dbe5ab21d56d803452b5b62a7d92b648942af583) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Standardize rule conventions for multi-cloud support: new CLDBRN rule ID format, ScanMode replaced by Source, severity removed, Finding.location replaced by structured ResourceLocation, rule files and exports renamed to policy-describing names.

### Patch Changes

- Updated dependencies [[`dbe5ab2`](https://github.com/towardsthecloud/cloudburn/commit/dbe5ab21d56d803452b5b62a7d92b648942af583)]:
  - @cloudburn/sdk@1.0.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`73cd4b0`](https://github.com/towardsthecloud/cloudburn/commit/73cd4b080aaca0c6601d565ea6e7958780c8de0c)]:
  - @cloudburn/sdk@0.2.0

## 0.1.0

### Minor Changes

- chore: initial public scaffold and version bump

### Patch Changes

- Updated dependencies []:
  - @cloudburn/sdk@0.1.0
