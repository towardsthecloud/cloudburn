# @cloudburn/vscode

## 0.1.1

### Patch Changes

- [#346](https://github.com/towardsthecloud/cloudburn/pull/346) [`f0f2d69`](https://github.com/towardsthecloud/cloudburn/commit/f0f2d695a098a38a5a19f74309cce41faaecee73) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Keep a refresh started by a file change, setting change, or workspace scan when a save interrupts it and save scans are
  then turned off, so warnings for deleted or renamed files no longer linger.

- [#346](https://github.com/towardsthecloud/cloudburn/pull/346) [`f0f2d69`](https://github.com/towardsthecloud/cloudburn/commit/f0f2d695a098a38a5a19f74309cce41faaecee73) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Rename the extension listing to CloudBurn and shorten its description.

## 0.1.0

### Minor Changes

- [#344](https://github.com/towardsthecloud/cloudburn/pull/344) [`3a611d4`](https://github.com/towardsthecloud/cloudburn/commit/3a611d4d6bc3cb8baa4a9dc4b58a2bac19d1d56c) Thanks [@axonstone](https://github.com/axonstone)! - Add a VS Code extension that runs CloudBurn's CLI on saved Terraform and CloudFormation workspaces, displays cost
  findings and incomplete scans, and links to rule documentation and the CI guide. Saved shared configs refresh each
  referencing workspace, including explicit symlink aliases, while file renames and deletions refresh already-scanned
  workspaces even when save scans are disabled. Findings without source locations appear as workspace diagnostics
  alongside scan coverage warnings. Publish its tested VSIX to Visual Studio Marketplace and Open VSX through a scoped
  tag release workflow with PAT-based authentication.
