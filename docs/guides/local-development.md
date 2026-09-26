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
pnpm turbo run test:e2e --filter @cloudburn/action
pnpm turbo run test:e2e --filter @cloudburn/mcp
pnpm --filter @cloudburn/sdk exec vitest run test/discovery-http-integration.test.ts
pnpm test:e2e
pnpm test:packages
```

Package names are `cloudburn`, `@cloudburn/action`, `@cloudburn/mcp`, `@cloudburn/sdk`, and `@cloudburn/rules`.
For action input, comment, or bundle changes, start with the [action package instructions](../../packages/action/AGENTS.md).
For MCP tools, the skill, or plugin manifests, start with the [MCP package instructions](../../packages/mcp/AGENTS.md).
To try a local server build in an agent, register `node <repository>/packages/mcp/dist/cli.js` as an MCP server.
For release recovery changes, use the [release guide](releasing.md#recover-published-release-follow-up-steps) and
`pnpm release:test`; its Git remotes and GitHub responses are local test fixtures.

## Validation

Use the smallest relevant test while iterating, then run the gate appropriate to the change:

| Change                                                | Final gate                          |
| ----------------------------------------------------- | ----------------------------------- |
| Documentation only                                    | `pnpm docs:check && pnpm docs:test` |
| Behavior, tests, dependencies, or build configuration | `pnpm verify`                       |

Use `pnpm exec turbo boundaries` for focused boundary checks while iterating. The final `pnpm verify` gate includes
documentation and boundary checks and all test suites; do not repeat included checks on unchanged inputs without a new
failure or concern. Focused tests run during development need not be run again separately after that gate.

`pnpm verify` runs documentation checks, package boundaries, lint, typecheck, and all tests, including release recovery,
built CLI/action, and installed-package checks. The installed-package suite needs public npm registry access; all AWS discovery responses are synthetic. See the [testing strategy](../TESTING.md) and [command
reference](../reference/commands.md) for narrower commands and side effects.
