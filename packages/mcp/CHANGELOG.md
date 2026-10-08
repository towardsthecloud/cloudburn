# @cloudburn/mcp

## 0.1.7

### Patch Changes

- [#336](https://github.com/towardsthecloud/cloudburn/pull/336) [`3e8d3cb`](https://github.com/towardsthecloud/cloudburn/commit/3e8d3cb63f92faf7d6b4424a8d4e4645d0122320) Thanks [@devin-ai-integration](https://github.com/apps/devin-ai-integration)! - Restrict `configPath` to `.cloudburn.yml` and `.cloudburn.yaml` files so arbitrary files cannot be read through the scan tools.
  This changes behavior: a `configPath` with any other filename, such as `settings.yaml`, now returns `INVALID_ARGUMENT`.
  Rename a custom config file to `.cloudburn.yml` or `.cloudburn.yaml` to keep using it through MCP.

- [#337](https://github.com/towardsthecloud/cloudburn/pull/337) [`b5c3516`](https://github.com/towardsthecloud/cloudburn/commit/b5c3516dc0869e7233f16a5a7d99f807b24c1adf) Thanks [@devin-ai-integration](https://github.com/apps/devin-ai-integration)! - Keep the default evidence cache out of the working directory when `XDG_CACHE_HOME` is empty or relative.
- Updated dependencies [[`1fc5301`](https://github.com/towardsthecloud/cloudburn/commit/1fc5301c18dc219879c32d67b37a61982aad4810), [`3e8d3cb`](https://github.com/towardsthecloud/cloudburn/commit/3e8d3cb63f92faf7d6b4424a8d4e4645d0122320), [`97007d9`](https://github.com/towardsthecloud/cloudburn/commit/97007d90bbcd4e3b9bef100a37d16f89f8305c7f), [`77ecadb`](https://github.com/towardsthecloud/cloudburn/commit/77ecadbc68050b210dd3ab228044a2632f98c21d), [`0b77c47`](https://github.com/towardsthecloud/cloudburn/commit/0b77c475ab122c296666ec02889efee65ade17dc), [`b5c3516`](https://github.com/towardsthecloud/cloudburn/commit/b5c3516dc0869e7233f16a5a7d99f807b24c1adf), [`4250bfc`](https://github.com/towardsthecloud/cloudburn/commit/4250bfc7b1e56e6ac717cdf6b686858e1b289fa1)]:
  - @cloudburn/sdk@0.38.2

## 0.1.6

### Patch Changes

- Updated dependencies [[`31d42f6`](https://github.com/towardsthecloud/cloudburn/commit/31d42f6123d98d01c2929a9eee2964964b37728c), [`2c10f45`](https://github.com/towardsthecloud/cloudburn/commit/2c10f45694ec90a3ec0ac9dfa87e57cf890ff4d9), [`654663b`](https://github.com/towardsthecloud/cloudburn/commit/654663b0c5425f6c878767bc987c80d0542902a8), [`ce10444`](https://github.com/towardsthecloud/cloudburn/commit/ce104442ce0582743fb5ced8a6df9ca36181cb87), [`9d80bd9`](https://github.com/towardsthecloud/cloudburn/commit/9d80bd96bd35a6aed12eb194b0d3ab513e8f841b), [`b73df4e`](https://github.com/towardsthecloud/cloudburn/commit/b73df4e10b94138d255b9e1d1166faad69755b6f), [`0403703`](https://github.com/towardsthecloud/cloudburn/commit/0403703ffc3a0a14ba9e27befc78c300ea8fbc95), [`8daad1c`](https://github.com/towardsthecloud/cloudburn/commit/8daad1cd6e23f19f21a8d190c191992bedb9ff76)]:
  - @cloudburn/sdk@0.38.1

## 0.1.5

### Patch Changes

- [#315](https://github.com/towardsthecloud/cloudburn/pull/315) [`ef7cfac`](https://github.com/towardsthecloud/cloudburn/commit/ef7cfac9f170e22ef8e7496f04cc37c4d61e360c) Thanks [@dannysteenman](https://github.com/dannysteenman)! - Add the npm ownership-verification metadata required to submit CloudBurn to the official MCP Registry.

## 0.1.4

### Patch Changes

- Updated dependencies [[`9906040`](https://github.com/towardsthecloud/cloudburn/commit/99060404d817bcc6f2c1575755fc0c5a75e523e2), [`9906040`](https://github.com/towardsthecloud/cloudburn/commit/99060404d817bcc6f2c1575755fc0c5a75e523e2)]:
  - @cloudburn/sdk@0.38.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`8b4996d`](https://github.com/towardsthecloud/cloudburn/commit/8b4996d241b29f7cf3a6cbeffc956d8a54e0f78c)]:
  - @cloudburn/sdk@0.37.3

## 0.1.2

### Patch Changes

- Updated dependencies [[`fc0f015`](https://github.com/towardsthecloud/cloudburn/commit/fc0f015a06fdbdf3c400fe5f116712f2458b1418)]:
  - @cloudburn/sdk@0.37.2

## 0.1.1

### Patch Changes

- [#305](https://github.com/towardsthecloud/cloudburn/pull/305) [`f6a4fc1`](https://github.com/towardsthecloud/cloudburn/commit/f6a4fc11b079d11ead2b5416fdf3fb4777fdaa3a) Thanks [@axonstone](https://github.com/axonstone)! - Show the CloudBurn icon for the agent plugin in the Claude plugin directory.

## 0.1.0

### Minor Changes

- [#303](https://github.com/towardsthecloud/cloudburn/pull/303) [`cd1a220`](https://github.com/towardsthecloud/cloudburn/commit/cd1a220db540b046d2bfe9e71f04deb5caefdee9) Thanks [@axonstone](https://github.com/axonstone)! - Add the CloudBurn MCP server and agent plugin. The stdio server exposes read-only `scan_iac`, `discover`,
  `discovery_status`, and `list_rules` tools, and the plugin bundles it with a CloudBurn skill for Claude Code, Codex,
  and skills.sh.
