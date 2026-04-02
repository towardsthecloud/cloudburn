# Contributing to CloudBurn

Thanks for contributing to CloudBurn.

## Prerequisites

- Node.js 24+
- pnpm 10+

## Local Setup

```bash
pnpm install
pnpm build
```

`pnpm install` runs the root `prepare` script and installs the Husky git hooks for
the repo. If you installed with scripts disabled, run:

```bash
pnpm prepare
```

## Verify Before Opening a PR

```bash
pnpm verify
```

This runs lint, typecheck, and test across the monorepo.

## Project Boundaries

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full package graph and responsibility matrix.

The dependency direction is `cli -> sdk -> rules`. No reverse imports.

## Code Style

- Add TSDoc docstrings to all exports. Document purpose, parameters, and return values.

## Adding a New Rule

See [`docs/guides/adding-a-rule.md`](docs/guides/adding-a-rule.md) for the full end-to-end walkthrough covering file placement, `createRule`, dataset dependencies, tests, and registration.

## Changesets

Write `.changeset/<slug>.md` files directly for user-facing package changes. Published packages: `cloudburn` (cli), `@cloudburn/sdk`, `@cloudburn/rules`.

One changeset file per package — never list multiple packages in one file.

Do not run the versioning step in feature PRs. Versioning happens in the automated
release PR on `main`.

Maintainer-only release scripts:

```bash
pnpm changeset:version
pnpm release
```

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) with package scope:

```text
feat(sdk): add S3 lifecycle rule support
fix(rules): correct evaluator for CLDBRN-AWS-EBS-1
refactor(cli): simplify output formatter
```

Types: `feat|fix|refactor|build|ci|chore|revert|docs|style|perf|test`.

## Pull Requests

- Use a conventional commit title matching the primary change (e.g. `feat(sdk): short description`).
- Fill in `.github/pull_request_template.md`.
- Link related issues.
- Include what you tested.

## Issues

Use GitHub issue forms:

- Bug Report
- Feature Request

Security disclosures should not be filed as public issues.
