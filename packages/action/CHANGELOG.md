# @cloudburn/action

## 1.0.5

### Patch Changes

- Updated dependencies [[`31d42f6`](https://github.com/towardsthecloud/cloudburn/commit/31d42f6123d98d01c2929a9eee2964964b37728c), [`2c10f45`](https://github.com/towardsthecloud/cloudburn/commit/2c10f45694ec90a3ec0ac9dfa87e57cf890ff4d9), [`654663b`](https://github.com/towardsthecloud/cloudburn/commit/654663b0c5425f6c878767bc987c80d0542902a8), [`ce10444`](https://github.com/towardsthecloud/cloudburn/commit/ce104442ce0582743fb5ced8a6df9ca36181cb87), [`9d80bd9`](https://github.com/towardsthecloud/cloudburn/commit/9d80bd96bd35a6aed12eb194b0d3ab513e8f841b), [`b73df4e`](https://github.com/towardsthecloud/cloudburn/commit/b73df4e10b94138d255b9e1d1166faad69755b6f), [`0403703`](https://github.com/towardsthecloud/cloudburn/commit/0403703ffc3a0a14ba9e27befc78c300ea8fbc95), [`8daad1c`](https://github.com/towardsthecloud/cloudburn/commit/8daad1cd6e23f19f21a8d190c191992bedb9ff76)]:
  - @cloudburn/sdk@0.38.1

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
