# cloudburn

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

- [#2](https://github.com/towardsthecloud/cloudburn/pull/2) [`dbe5ab2`](https://github.com/towardsthecloud/cloudburn/commit/dbe5ab21d56d803452b5b62a7d92b648942af583) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Standardize rule conventions for multi-cloud support: new CLDBRN rule ID format, ScanMode replaced by ScanSource, severity removed, Finding.location replaced by structured ResourceLocation, rule files and exports renamed to policy-describing names.

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
