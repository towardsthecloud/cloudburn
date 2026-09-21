# @cloudburn/action

Source of the `towardsthecloud/cloudburn-action` GitHub Action. The release workflow syncs `action.yml`, `dist/`,
README, and LICENSE into the dedicated public repository; this package is the authoritative source.

## Boundaries

- The action is a distribution channel for the static IaC scan only. Live discovery stays in the CLI.
- Call `@cloudburn/sdk` (`CloudBurnClient.loadConfig`, `scanStatic`, `evaluateScanPolicy`); never import
  `@cloudburn/rules` or the `cloudburn` package. Scan semantics mirror `packages/cloudburn/src/commands/scan.ts`.
- `action.yml` is the public contract: input names mirror `scan` flags, outputs are additive-only.
- `dist/` is build output. tsup rewrites the `@cdktf/hcl2json` WASM lookup and copies `main.wasm.gz` beside
  `dist/index.cjs`; both files ship to the target repository.
- The action package is private. Changesets still versions and tags it (`@cloudburn/action@x.y.z`), and the version
  tracks `@cloudburn/sdk` automatically: the `workspace:*` pin counts as an exact version, so every SDK release bumps
  the action. Keep the pin.

## Testing

- `vitest` unit tests mock the GitHub toolkit boundary (`@actions/core`, `@actions/github`).
- `test/e2e/` runs the built `dist/index.cjs` in a child process with `INPUT_*`/`GITHUB_*` environment variables against
  the CLI's `test/e2e` fixtures. No AWS credentials, no real pull requests.
- Validate with `pnpm exec turbo run lint typecheck test test:e2e --filter @cloudburn/action`, or `pnpm verify` for the
  full gate.
