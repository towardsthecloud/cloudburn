# @cloudburn/rules

## 0.3.0

### Minor Changes

- [#8](https://github.com/towardsthecloud/cloudburn/pull/8) [`e45d012`](https://github.com/towardsthecloud/cloudburn/commit/e45d012297e4cd19560fb84ca8dd0fa1f6cf7a23) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add Terraform static scanning for literal EBS gp2 volumes and extend the built-in EBS current-generation rule to support both live discovery and IaC evaluation.

## 1.0.0

### Major Changes

- [#2](https://github.com/towardsthecloud/cloudburn/pull/2) [`dbe5ab2`](https://github.com/towardsthecloud/cloudburn/commit/dbe5ab21d56d803452b5b62a7d92b648942af583) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Standardize rule conventions for multi-cloud support: new CLDBRN rule ID format, ScanMode replaced by ScanSource, severity removed, Finding.location replaced by structured ResourceLocation, rule files and exports renamed to policy-describing names.

## 0.2.0

### Minor Changes

- [#1](https://github.com/towardsthecloud/cloudburn/pull/1) [`73cd4b0`](https://github.com/towardsthecloud/cloudburn/commit/73cd4b080aaca0c6601d565ea6e7958780c8de0c) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add the first executable live AWS rule for detecting EBS gp2 volumes that should migrate to gp3.

## 0.1.0

### Minor Changes

- chore: initial public scaffold and version bump
