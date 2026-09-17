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
  Rule IDs are immutable; never renumber or reuse assigned IDs, including after rule removal.

## Skills

- Update skills in `skills-lock.json` with `pnpm dlx skills update --project --yes`; never hand-edit their files or lock
  entries. Edit custom skills such as `roadmap` directly; keep repository overrides here.
- Load relevant references, deduplicate workflows, and finish authorized implementation, fixes, and verification.
- Use `turborepo` only for task graphs, caching, filtering, or build orchestration. Root build/test scripts delegate to
  Turbo; docs/release/validation wrappers may run directly. Package scripts invoke tools; package-context Turbo is allowed.
  Add Root Tasks only when orchestration is needed; never recurse into Turbo.
- Use `diagnosing-bugs` for hard bugs, regressions, flaky tests, or performance. Without a runnable reproduction, continue
  read-only tracing with labeled hypotheses while requesting missing evidence. Keep diagnostics targeted and redacted;
  production instrumentation requires authorization.
- For `tdd`, infer boundaries from public interfaces and requested behavior; ask only about blocking interface/behavior
  decisions. Follow package mocking rules and the testing strategy; allow needed refactors while keeping tests green.
- Use the pre-PR simplifier where `tdd` references the unavailable `code-review` skill.

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
