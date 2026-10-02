# @cloudburn/action

## 1.0.4

### Patch Changes

- [#313](https://github.com/towardsthecloud/cloudburn/pull/313) [`9906040`](https://github.com/towardsthecloud/cloudburn/commit/99060404d817bcc6f2c1575755fc0c5a75e523e2) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Report AWS credential, access-denied, and discovery errors with the same error codes as the CLI instead of a generic runtime error.
- Updated dependencies [[`9906040`](https://github.com/towardsthecloud/cloudburn/commit/99060404d817bcc6f2c1575755fc0c5a75e523e2), [`9906040`](https://github.com/towardsthecloud/cloudburn/commit/99060404d817bcc6f2c1575755fc0c5a75e523e2)]:
  - @cloudburn/sdk@0.38.0

## 1.0.3

### Patch Changes

- Updated dependencies [[`8b4996d`](https://github.com/towardsthecloud/cloudburn/commit/8b4996d241b29f7cf3a6cbeffc956d8a54e0f78c)]:
  - @cloudburn/sdk@0.37.3

## 1.0.2

### Patch Changes

- Updated dependencies [[`fc0f015`](https://github.com/towardsthecloud/cloudburn/commit/fc0f015a06fdbdf3c400fe5f116712f2458b1418)]:
  - @cloudburn/sdk@0.37.2

## 1.0.1

### Patch Changes

- [#295](https://github.com/towardsthecloud/cloudburn/pull/295) [`1004505`](https://github.com/towardsthecloud/cloudburn/commit/100450592e14f22849dda5e9b564c35bf14859bc) Thanks [@axonstone](https://github.com/axonstone)! - Ship CloudBurn's IaC scan as a GitHub Action. `@cloudburn/action` bundles the SDK into a single `dist/index.cjs`,
  annotates findings on pull requests, posts a sticky comment, writes a step summary, and fails the job through the same
  `fail-on`/`exit-code` policy semantics as `cloudburn scan`. The release workflow syncs the built bundle to the public
  `towardsthecloud/cloudburn-action` repository behind version and floating major tags.
  
  The bundle excludes AWS discovery clients and runs without installed dependencies. Sticky comments support custom
  GitHub App installation tokens as well as the default workflow token and personal access tokens.
