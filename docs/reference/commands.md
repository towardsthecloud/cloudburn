# Command reference

The [root manifest](../../package.json) owns command definitions; [Turbo configuration](../../turbo.json) owns task
dependencies and caching. Package manifests own the scripts that Turbo invokes.

| Command                      | Purpose                                                           | Notes                                                                  |
| ---------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`                   | Run package watch tasks                                           | Persistent and uncached                                                |
| `pnpm build`                 | Build all packages                                                | Produces package `dist/` directories                                   |
| `pnpm typecheck`             | Type-check package sources and tests                              | Depends on upstream builds                                             |
| `pnpm test`                  | Run documentation, release, source, built CLI, and installed-package tests | Artifact suites build their dependencies                               |
| `pnpm test:e2e`              | Run the built CLI against real template fixtures                  | Builds the CLI and its dependencies; does not contact AWS              |
| `pnpm test:packages`         | Install local package archives and verify public entry points     | Builds packages; requires public npm access; uncached; never publishes |
| `pnpm lint`                  | Check package source and tests with Biome                         | Read-only                                                              |
| `pnpm lint:fix`              | Apply Biome fixes                                                 | Mutates files and is uncached                                          |
| `pnpm docs:check`            | Check the repository knowledge system                             | Validates links, fragments, aliases, reachability, and entry points    |
| `pnpm docs:test`             | Test the public documentation checker CLI                         | Uses dependency-free `node:test` fixtures                              |
| `pnpm release:test`          | Test changelog lookup recovery and GitHub link formatting          | Uses a local synthetic GraphQL server; never versions or publishes packages |
| `pnpm exec turbo boundaries` | Enforce `cli -> sdk -> rules`                                     | This is the supported boundary command                                 |
| `pnpm verify`                | Run documentation, boundaries, lint, typecheck, and all tests     | Full local gate; `--affected` limits package tasks                     |
| `pnpm clean`                 | Remove package build output                                       | Destructive only to generated `dist/` output                           |
| `pnpm depupdate`             | Update the pnpm pin and dependencies                              | Mutates manifests and the lockfile                                     |

## Discovery timeout

`cloudburn discover --timeout <seconds>` sets the total discovery deadline (default: 300 seconds). The value must be an integer from 1 to 2147483. An expired deadline stops AWS work and exits with code 2. SDK callers can set `timeoutMs` and provide an `AbortSignal` to `CloudBurnClient.discover()`.

## Discovery evidence cache

| Option                 | Default                                                                | Behavior                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--cache normal`       | `normal`                                                               | Reuse fresh, complete evidence; load missing or expired evidence. Rules and configuration are evaluated on every run.                                               |
| `--cache refresh`      |                                                                        | Collect current evidence without falling back to cached evidence if collection fails. Only complete successful loads replace entries.                               |
| `--cache off`          |                                                                        | Bypass persistent evidence reads and writes.                                                                                                                        |
| `--cache-dir <path>`   | `$XDG_CACHE_HOME/cloudburn/evidence`, or `~/.cache/cloudburn/evidence` | Select local persistent storage for normalized AWS evidence and independent public pricing artifacts.                                                               |
| `--cache-context <id>` | Temporary AWS credential session scope when derivable                  | Identify the effective authorization and session-policy revision. Change this value when those permissions change; an account ID or role ARN alone is insufficient. |

Without a safe temporary credential scope or an explicit context, customer evidence reuse is disabled. Public pricing
can still be reused independently. Cache entries never include credentials. `--cache off` also disables public pricing
persistence. A cache read does not prove AWS discovery coverage: source delays and unknown resources remain visible
through evidence completeness, coverage, and diagnostics.

Table output summarizes cached and newly collected evidence, incomplete entries, and the oldest observation timestamp.
JSON output preserves the full `evidence` array, including collection and observation times, cache source, and coverage.
Freshness TTLs are tunable starting policies, not measured optimal defaults; use the SDK cache options to tune them, or
`--cache refresh` when a run needs newly collected evidence. See the [SDK README](../../packages/sdk/README.md) for
freshness policies and configured SDK reuse.

## Turbo filters

```bash
pnpm turbo run build --filter @cloudburn/sdk
pnpm turbo run test --filter cloudburn...
pnpm turbo run lint --filter ...[main]
```

Package layer tags live in each package's `turbo.json`, not its `package.json`. Root `turbo.json` maps those tags to denied
dependency directions and defines task caching: `cloudburn` is `layer:cli`, `@cloudburn/sdk` is `layer:sdk`, and
`@cloudburn/rules` is `layer:rules`.

`build` depends on upstream builds and caches `dist/**`; its inputs exclude `test/**` because fixtures do not affect published output. `typecheck` depends on upstream builds. Source `test` tasks use the `test:inputs` transit task to inherit upstream source hashes without waiting for builds or upstream tests. `test:e2e` and `test:package` depend on the current package build. `test:package` is uncached because it installs archives with public registry dependencies.
`dev` is persistent and uncached, while `lint:fix` and `clean` are uncached because they mutate or remove files. Changes to
`tsconfig.base.json`, `biome.jsonc`, `pnpm-lock.yaml`, or the root `package.json` invalidate the shared task cache.

## Release-only commands

`pnpm changeset:version` and `pnpm release` mutate versioned artifacts or publish packages. They are reserved for the
automated release flow or explicit maintainer operations; do not run them during normal feature work. See the [release
guide](../guides/releasing.md).
