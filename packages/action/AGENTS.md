# @cloudburn/action

Source of the `towardsthecloud/cloudburn-action` GitHub Action. This package owns the manifest, wrapper, and build;
the dedicated public repository receives only release artifacts. The [package README](README.md) owns workflow usage.

## Boundaries

- The action is a distribution channel for the static IaC scan only. Live discovery stays in the CLI.
- Call `@cloudburn/sdk` (`CloudBurnClient.loadConfig`, `scanStatic`, `evaluateScanPolicy`); never import
  `@cloudburn/rules` or the `cloudburn` package. Scan semantics mirror `packages/cloudburn/src/commands/scan.ts`.
- `action.yml` is the public contract: input names mirror `scan` flags, outputs are additive-only.
- Keep AWS SDK and Smithy discovery packages out of the static bundle. Scans must run from the shipped JavaScript
  and WASM without installed dependencies. Before changing bundling or sync inputs, read
  [generated-file ownership](../../docs/reference/generated-files.md).
- Match sticky comments to the token's authenticated GraphQL viewer. Custom installation tokens have their own bot
  identity; never infer ownership from the workflow actor or fall back to a hard-coded bot.
- The action package is private. Changesets still versions and tags it (`@cloudburn/action@x.y.z`), and the version
  tracks `@cloudburn/sdk` automatically: the `workspace:*` pin counts as an exact version, so every SDK release bumps
  the action. Keep the pin.
- For target-repository setup and Marketplace publication, follow [action sync](../../docs/guides/releasing.md#github-action-sync).
  For tag repair, follow [selective release recovery](../../docs/guides/releasing.md#recover-published-release-follow-up-steps);
  do not run workspace-wide tag creation during recovery of a selected release.

## Testing

- `vitest` unit tests mock the GitHub toolkit boundary (`@actions/core`, `@actions/github`).
- `test/e2e/` audits the bundle metadata and runs isolated shipped artifacts against the CLI's Terraform and
  CloudFormation fixtures. Keep workspace dependencies unavailable to these tests; see the
  [testing strategy](../../docs/TESTING.md). No AWS credentials or real pull requests are used.
- For focused code or build validation, run `pnpm exec turbo run lint typecheck test test:e2e --filter @cloudburn/action`.
  Finish those changes with the root `pnpm verify` gate; documentation-only changes follow root validation guidance.
