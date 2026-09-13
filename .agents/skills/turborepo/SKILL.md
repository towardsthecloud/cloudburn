---
name: turborepo
description: |
  Configure or troubleshoot Turborepo task graphs, caching, filtering, and package
  build orchestration. Use when the task changes or investigates those behaviors,
  including Turbo integration with CI or package boundaries.
metadata:
  version: 2.10.6-canary.3
---

# Turborepo

Use this skill for Turborepo behavior. Ordinary application or documentation changes
in a monorepo do not require it.

## Task placement

Define package build and test scripts in the packages that own them and use Turbo
for their orchestration. Root scripts for those tasks delegate to `turbo run`.
Repository-wide tooling and wrappers, such as docs checks, release tooling, and
validation wrappers, may run directly from the root. Register a Root Task
(`//#taskname`) only when that repository-wide operation needs Turbo orchestration;
a Root Task must not invoke Turbo recursively.

Use `turbo run <task>` in package scripts and CI. The `turbo <task>` shorthand is
for interactive use.

## Read only the relevant reference

Choose the reference that resolves the current task or uncertainty; follow further
links only when needed. Existing repository instructions own validation commands.

| Task or question | Reference |
| --- | --- |
| Task dependencies, outputs, inputs, persistent tasks, or transit nodes | [Task configuration](references/configuration/tasks.md) |
| Package configurations and where task logic belongs | [Configuration overview](references/configuration/RULE.md) |
| Global hashing, environment, and configuration options | [Global options](references/configuration/global-options.md) |
| Configuration mistakes, dependency builds, or TypeScript outputs | [Configuration gotchas](references/configuration/gotchas.md) |
| Cache model and hash inputs | [Caching](references/caching/RULE.md) |
| Missing outputs or unexpected cache misses | [Cache debugging](references/caching/gotchas.md) |
| Remote cache setup or failures | [Remote cache](references/caching/remote-cache.md) |
| Environment hashing and pass-through variables | [Environment configuration](references/environment/RULE.md) |
| Strict/loose modes and framework inference | [Environment modes](references/environment/modes.md) |
| `.env` invalidation or missing CI variables | [Environment gotchas](references/environment/gotchas.md) |
| Selecting packages, including changed packages | [Filtering](references/filtering/RULE.md) |
| Combining dependency, directory, and Git filters | [Filter patterns](references/filtering/patterns.md) |
| Turbo orchestration in CI | [CI overview](references/ci/RULE.md) |
| GitHub Actions configuration | [GitHub Actions](references/ci/github-actions.md) |
| Vercel builds and `turbo-ignore` | [Vercel](references/ci/vercel.md) |
| Affected packages and CI caching strategies | [CI patterns](references/ci/patterns.md) |
| Basic task execution | [CLI overview](references/cli/RULE.md) |
| Flags and other Turbo commands | [CLI commands](references/cli/commands.md) |
| Package roles in the task graph | [Package practices](references/best-practices/RULE.md) |
| Workspace layout and shared build configuration | [Structure](references/best-practices/structure.md) |
| Internal package compilation and exports | [Internal packages](references/best-practices/packages.md) |
| Dependency declarations and management | [Dependencies](references/best-practices/dependencies.md) |
| Watch mode and dependent development tasks | [Watch mode](references/watch/RULE.md) |
| Turbo boundary checks and tag rules | [Boundaries](references/boundaries/RULE.md) |

## Source documentation

These references derive from `apps/docs/content/docs/` in the Turborepo repository.
Check the project's installed Turbo version before applying version-specific
options; consult the [official documentation](https://turborepo.dev/docs) when needed.
