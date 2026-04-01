# Turborepo Guide

This monorepo uses Turborepo for task orchestration and pnpm for workspace dependency management.

## Workspace Structure

```text
packages/
  cloudburn/    -> cloudburn (cli)
  sdk/          -> @cloudburn/sdk
  rules/        -> @cloudburn/rules
```

## Dependency Graph

See [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) for the full package graph and responsibility matrix.

## Root Scripts

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm lint:fix
pnpm verify
pnpm clean
pnpm changeset
pnpm changeset:version
pnpm release
```

## Turbo Tasks

- `build`: depends on `^build`, caches `dist/**`.
- `typecheck`: depends on `^build` only.
- `test`: depends on `^build` only.
- `lint`: no dependencies, no special config.
- `lint:fix`: non-cacheable because it mutates files.
- `dev`: persistent, non-cacheable task.
- `clean`: non-cacheable.

`globalDependencies` include root config files (`tsconfig.base.json`, `biome.jsonc`, `pnpm-lock.yaml`, `package.json`) so cache invalidates when shared configuration changes.

## Boundaries

Turborepo enforces the `cli -> sdk -> rules` dependency direction via `boundaries` in `turbo.json`. Each package is tagged with a layer:

| Tag           | Package            | Denied dependencies             |
| ------------- | ------------------ | ------------------------------- |
| `layer:rules` | `@cloudburn/rules` | `layer:sdk`, `layer:cli`        |
| `layer:sdk`   | `@cloudburn/sdk`   | `layer:cli`                     |
| `layer:cli`   | `cloudburn`        | (none — can depend on anything) |

Tags are declared in each package's `package.json` under `turbo.boundaries.tags`. If a package imports a denied dependency, `turbo boundaries check` (or `turbo run boundaries`) will fail.

This enforces the architectural invariant: rules must be pure (no SDK or CLI imports), SDK must not import CLI code.

## Filtering Examples

```bash
pnpm turbo run build --filter @cloudburn/sdk
pnpm turbo run test --filter cloudburn...
pnpm turbo run lint --filter ...[main]
```

## Changesets and Changelog

CloudBurn uses Changesets with GitHub changelog integration.

```bash
pnpm changeset
pnpm changeset:version
pnpm release
```

Changelog entries include PR and commit links for `towardsthecloud/cloudburn`.
