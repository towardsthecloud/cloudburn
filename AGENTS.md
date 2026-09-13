# AGENTS.md

CloudBurn is a pnpm/Turborepo monorepo for a CLI, SDK, and pure rule package that detect AWS cost issues in IaC and live
accounts. Dependency direction is `cloudburn CLI -> @cloudburn/sdk -> @cloudburn/rules`.

## Start with the task

- Read the nearest package instructions before editing: [CLI](packages/cloudburn/AGENTS.md),
  [SDK](packages/sdk/AGENTS.md), or [rules](packages/rules/AGENTS.md).
- For setup and focused commands, use [local development](docs/guides/local-development.md). For task dependencies,
  caching, and command side effects, use the [command reference](docs/reference/commands.md).
- For a new rule, start with [adding a rule](docs/guides/adding-a-rule.md); it routes dataset changes to the SDK guides.
- For changes to package responsibilities or dependencies, use the [architecture](docs/ARCHITECTURE.md).
  For changes to test boundaries or coverage, use the [testing strategy](docs/TESTING.md).
- Before editing build output or reference tables, check [generated-file ownership](docs/reference/generated-files.md).
- Use the [documentation catalog](docs/README.md) for authoritative sources, documentation maintenance, and deeper pages.
  Human onboarding starts in [CONTRIBUTING.md](CONTRIBUTING.md).

## Repository constraints

- Preserve each relative `CLAUDE.md -> AGENTS.md` symlink; edit the shared `AGENTS.md` source.
- Update the owning docs with changes to behavior, contracts, commands, or generated outputs; follow the
  [maintenance policy](docs/README.md#maintenance).
- Add TSDoc purpose, parameters, and return values to exported code.
- Use red-green TDD for substantial behavior changes and meaningful regression cases; work in vertical slices.
  Verify smaller changes appropriately without adding tests that merely mirror the implementation.
- For IaC rules, cover both Terraform and CloudFormation inputs.
- Before assigning or changing rule IDs, read the [ID convention and compatibility status](docs/reference/rule-ids.md).
  Public ID stability remains unresolved; do not renumber IDs during unrelated maintenance.

## Validation

- Documentation only: `pnpm docs:check && pnpm docs:test`.
- Use the smallest relevant focused test while iterating; use `pnpm exec turbo boundaries` for focused boundary checks.
- Behavior, tests, dependencies, or build configuration: finish with `pnpm verify`. It includes documentation and
  boundary checks and all test suites; do not repeat included checks on unchanged inputs without a new concern.
- Report fresh validation from the checkout containing the changes.

## Git and releases

- Do not commit or open a pull request on `main` unless explicitly asked. On other branches, commit each meaningful set of
  edits with a Conventional Commit; use the package scope for package changes.
- Pull requests target `main`, use the repository template, and apply `enhancement` for `feat`, `bug` for `fix`, or
  `documentation` for `docs`.
- For user-facing package changes, follow the [changeset and release guide](docs/guides/releasing.md).
  Documentation-only changes do not need changesets. Never run versioning or publishing commands in a feature task.
