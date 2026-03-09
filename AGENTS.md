# AGENTS.md

## Documentation Map

<!--- source for map: https://openai.com/index/harness-engineering/ -->

| Area                       | Doc                                                                                      | What it covers                                              |
| -------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Architecture**           | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                                           | Package graph, scan data flow sequence diagrams             |
| CLI internals              | [`docs/architecture/cli.md`](docs/architecture/cli.md)                                   | Command tree, formatter pipeline, exit-code contract        |
| SDK internals              | [`docs/architecture/sdk.md`](docs/architecture/sdk.md)                                   | Scanner facade, config pipeline, engine, parsers, providers |
| Rules internals            | [`docs/architecture/rules.md`](docs/architecture/rules.md)                               | Type hierarchy, rule assembly chain, ID convention          |
| **Guides**                 |                                                                                          |                                                             |
| Adding a rule              | [`docs/guides/adding-a-rule.md`](docs/guides/adding-a-rule.md)                           | End-to-end: file placement, createRule, tests, registration |
| Adding a provider resource | [`docs/guides/adding-a-provider-resource.md`](docs/guides/adding-a-provider-resource.md) | Discoverer, scanner wiring, context type extension          |
| **Reference**              |                                                                                          |                                                             |
| Config schema              | [`docs/reference/config-schema.md`](docs/reference/config-schema.md)                     | Every CloudBurnConfig field, defaults, merge behavior       |
| Rule IDs                   | [`docs/reference/rule-ids.md`](docs/reference/rule-ids.md)                               | ID table, naming convention, presets                        |
| Finding shape              | [`docs/reference/finding-shape.md`](docs/reference/finding-shape.md)                     | Finding, ResourceLocation, ScanResult type contracts        |
| **Infrastructure**         |                                                                                          |                                                             |
| Testing                    | [`docs/TESTING.md`](docs/TESTING.md)                                                     | Three-package test strategy, fixtures, TDD flow             |
| Turborepo                  | [`docs/TURBOREPO.md`](docs/TURBOREPO.md)                                                 | Task pipeline, boundaries, filtering                        |
| Code review                | [`docs/REVIEW.md`](docs/REVIEW.md)                                                       | Non-obvious conventions and constraints for PR reviewers    |

## Code Style

- Add TSDoc docstrings to all exports. Document purpose, parameters, and return values.

## Context Management

- Proactively delegate exploration (3+ files), research, and analysis to subagents — only the summary matters in main context.

## Build / Test

- On branches/worktrees (non main), use the `tdd` skill (red-green-refactor) as the default build flow for features and bug fixes.
- Work in vertical slices: one test → minimal impl → refactor → commit. Never batch all tests first.
- When tests are green and you're ready to commit, run `pnpm verify` first (covers lint, typecheck, and test).
- Include verification tasks in plans, not only build tasks.

## Done Criteria

- Do not mark done without proof (tests, logs, or behavior checks).
- Review-ready requires a fresh local test run in this session.
- For multi-step tasks, track all steps and mark any blocked step with what is missing.

## Missing Context

- Do not guess rule IDs, config shapes, types, or provider behavior — look them up first.
- If a search returns empty or narrow results, try at least one fallback (alternate query, broader pattern) before concluding.
- Label assumptions explicitly when proceeding without full context.

## Git & PRs

- Use Conventional Commits (`feat|fix|refactor|build|ci|chore|revert|docs|style|perf|test`).
- When the change is for a package, include the scope: `feat(cli):`, `fix(sdk):`, `refactor(rules):`.
- **On `main`: never commit automatically.** Only commit when the user explicitly asks.
- **On branches / worktrees: commit after every meaningful set of edits** — do not wait for the user to ask.
- When done (on a branch or worktree), before creating a PR:
  1. If the PR changes a published package, write a changeset (see Changesets section below).
  2. Search for related issues with `gh issue list` and note any to link.
  3. Create the PR with a conventional title, fill in the template (`.github/pull_request_template.md`), check off completed items, and link related issues. Apply a label matching the commit type: `enhancement` for `feat`, `bug` for `fix`, `documentation` for `docs`. Example: `gh pr create --title "feat(cli): short description" --label enhancement`.

## Changesets

- Published packages: `cloudburn` (cli), `@cloudburn/sdk`, `@cloudburn/rules`.
- Write `.changeset/<random-kebab-case-slug>.md` directly — do not use the interactive `pnpm changeset` prompt.
- Changeset files must use full frontmatter delimiters: opening `---`, then the package bump lines, then closing `---`.
- Use `patch` for fixes and `minor` for new features. Never use `major` changesets.
- Only include packages directly changed by the PR.
- **One changeset file per package** — never list multiple packages in one file (the summary gets duplicated to all of them).
- Do not run `pnpm changeset:version` or `pnpm release` — those happen in the automated release PR.

## Architecture Boundaries

- Dependency direction: `cli → sdk → rules`. No reverse imports. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for diagrams.
- When working inside `packages/cloudburn`, `packages/sdk`, or `packages/rules`, follow that package's local `AGENTS.md` or `CLAUDE.md` for package-specific constraints.
- Before changing a type or export in `rules` or `sdk`, check downstream consumers for required updates.
