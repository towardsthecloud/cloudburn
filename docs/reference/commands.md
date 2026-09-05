# Command reference

The root `package.json` is authoritative for command definitions; `turbo.json` owns task dependencies and caching.

| Command                      | Purpose                                              | Notes                                                               |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm dev`                   | Run package watch tasks                              | Persistent and uncached                                             |
| `pnpm build`                 | Build all packages                                   | Produces package `dist/` directories                                |
| `pnpm typecheck`             | Type-check all packages                              | Depends on upstream builds                                          |
| `pnpm test`                  | Run documentation, source, built CLI, and installed-package tests | Artifact suites build their dependencies                             |
| `pnpm test:e2e`              | Run the built CLI against real template fixtures      | Builds the CLI and its dependencies; does not contact AWS            |
| `pnpm test:packages`         | Install local package archives and verify public entry points | Builds packages; requires public npm access; uncached; never publishes |
| `pnpm lint`                  | Check package source and tests with Biome            | Read-only                                                           |
| `pnpm lint:fix`              | Apply Biome fixes                                    | Mutates files and is uncached                                       |
| `pnpm docs:check`            | Check the repository knowledge system                | Validates links, fragments, aliases, reachability, and entry points |
| `pnpm docs:test`             | Test the public documentation checker CLI            | Uses dependency-free `node:test` fixtures                           |
| `pnpm exec turbo boundaries` | Enforce `cli -> sdk -> rules`                        | This is the supported boundary command                              |
| `pnpm verify`                | Run documentation, boundaries, lint, typecheck, and all tests | Full local gate; `--affected` limits package tasks                                                     |
| `pnpm clean`                 | Remove package build output                          | Destructive only to generated `dist/` output                        |
| `pnpm depupdate`             | Update Corepack and dependencies                     | Mutates manifests and the lockfile                                  |

## Discovery timeout

`cloudburn discover --timeout <seconds>` sets the total discovery deadline (default: 300 seconds). The value must be an integer from 1 to 2147483. An expired deadline stops AWS work and exits with code 2. SDK callers can set `timeoutMs` and provide an `AbortSignal` to `CloudBurnClient.discover()`.

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
