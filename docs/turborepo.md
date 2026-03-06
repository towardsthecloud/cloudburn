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

```text
cloudburn -> @cloudburn/sdk -> @cloudburn/rules
```

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
- `typecheck`: depends on `^build` and `^typecheck`.
- `test`: depends on `^build` and `^test`.
- `lint:fix`: non-cacheable because it mutates files.
- `dev`: persistent, non-cacheable task.

`globalDependencies` include root config files so cache invalidates when shared configuration changes.

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
