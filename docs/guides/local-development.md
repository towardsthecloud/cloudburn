# Local development

## Prerequisites

- Node.js 24 or newer. `.nvmrc` pins the version used locally and in CI.
- Corepack with pnpm 11. The exact pnpm release is pinned by `packageManager` in the root `package.json`.

## Setup

```bash
corepack enable
pnpm install
pnpm build
```

`pnpm install` runs the root `prepare` script and installs Husky hooks. If dependencies were installed with lifecycle
scripts disabled, run `pnpm prepare` explicitly.

## Focused work

Run all package development watchers with `pnpm dev`. Filter Turbo tasks while working on one package:

```bash
pnpm turbo run test --filter @cloudburn/rules
pnpm turbo run build --filter @cloudburn/sdk
pnpm turbo run lint --filter cloudburn
pnpm --filter @cloudburn/sdk exec vitest run test/discovery-http-integration.test.ts
pnpm test:e2e
pnpm test:packages
```

Package names are `cloudburn`, `@cloudburn/sdk`, and `@cloudburn/rules`.

## Validation

Use the smallest relevant test while iterating, then run the gate appropriate to the change:

```bash
pnpm docs:check && pnpm docs:test
pnpm exec turbo boundaries
pnpm verify
```

`pnpm verify` runs documentation checks, package boundaries, lint, typecheck, and all tests, including built CLI and installed-package checks. The installed-package suite needs public npm registry access; all AWS discovery responses are synthetic. See the [testing strategy](../TESTING.md) and [command
reference](../reference/commands.md) for narrower commands and side effects.
