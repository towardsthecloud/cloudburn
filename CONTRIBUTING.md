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

## Verify Before Opening a PR

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify
```

## Project Boundaries

- `@cloudburn/cli`: commands, formatting, exit code behavior.
- `@cloudburn/sdk`: scanner API, engine orchestration, config, parsers, provider adapters.
- `@cloudburn/rules`: rules and presets only (no parser/provider/engine logic).

## Adding a New Rule

1. Choose provider and service path under `packages/rules/src`.

- AWS example: `packages/rules/src/aws/ec2/`

2. Create a rule file using `createRule(...)` from `shared/helpers.ts`.
3. Include mandatory metadata:

- `id`, `name`, `description`, `provider`, `service`, `severity`, `supports`

4. Export it from service `index.ts` and provider `index.ts`.
5. Ensure preset inclusion when appropriate (`presets/aws-core.ts`).
6. Add or update tests in `packages/rules/test`.

## Rule Metadata Expectations

- IDs should be stable, lowercase, kebab-case.
- Keep descriptions user-facing and actionable.
- Set conservative default severity (`warning` unless clearly blocking).
- Prefer `supports: ['static', 'live']` only when both are implemented.

## Testing Guidance for Rules

- Add metadata/export coverage.
- Add focused unit tests for rule behavior once rule logic is implemented.
- Keep fixtures small and deterministic.

## Changesets

Use Changesets for user-facing package changes:

```bash
pnpm changeset
```

Version and release scripts:

```bash
pnpm changeset:version
pnpm release
```

## Pull Requests

- Use a focused title and scope.
- Fill in `.github/pull_request_template.md`.
- Link related issues.
- Include what you tested.

## Issues

Use GitHub issue forms:

- Bug Report
- Feature Request

Security disclosures should not be filed as public issues.
