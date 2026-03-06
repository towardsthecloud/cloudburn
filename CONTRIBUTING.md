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
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify
```

## Project Boundaries

- `cloudburn` (cli): commands, formatting, exit code behavior.
- `@cloudburn/sdk`: scanner API, engine orchestration, config, parsers, provider adapters.
- `@cloudburn/rules`: rules and presets only (no parser/provider/engine logic).

## Code Style

- Add TSDoc docstrings to all exports. Document purpose, parameters, and return values.

## Adding a New Rule

1. Choose provider and service path under `packages/rules/src`.

- AWS example: `packages/rules/src/aws/ec2/`

2. Create a rule file using `createRule(...)` from `shared/helpers.ts`.
3. Include mandatory metadata:

- `id`, `name`, `description`, `provider`, `service`, `supports`

Keep provider discovery, parsers, and cloud SDK calls in `@cloudburn/sdk`. Rule files in
`@cloudburn/rules` should stay pure and expose evaluators over normalized inputs.

4. Export it from service `index.ts` and provider `index.ts`.
5. Ensure preset inclusion when appropriate (`presets/aws-core.ts`).
6. Add or update tests in `packages/rules/test`.

## Rule Metadata Expectations

- IDs use the `CLDBRN-{PROVIDER}-{SERVICE}-{N}` format (uppercase, no zero-padding, sequential per service).
- Keep descriptions user-facing and actionable.
- Prefer `supports: ['iac', 'discovery']` only when both are implemented.
- Use `supports: ['discovery']` or `supports: ['iac']` when a rule only has one real evaluator.
- `CLDBRN-AWS-EBS-1` (`volume-type-current-gen`) is the reference example for a discovery-only rule backed by a pure evaluator.

## Testing Guidance for Rules

- Add metadata/export coverage.
- Add focused unit tests for rule behavior once rule logic is implemented.
- Keep fixtures small and deterministic.

## Changesets

Use Changesets for user-facing package changes:

```bash
pnpm changeset
```

Add the generated `.changeset/*.md` file to your PR when it changes a published package
(`cloudburn` (cli), `@cloudburn/sdk`, or `@cloudburn/rules`).

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
