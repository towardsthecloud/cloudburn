# AGENTS.md

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
- Use `patch` for fixes, `minor` for new features, `major` for breaking changes.
- Only include packages directly changed by the PR.
- Do not run `pnpm changeset:version` or `pnpm release` — those happen in the automated release PR.

## Architecture Boundaries

- Dependency direction: `cli → sdk → rules`. No reverse imports.
- When working inside `packages/cloudburn`, `packages/sdk`, or `packages/rules`, follow that package's local `AGENTS.md` or `CLAUDE.md` for package-specific constraints.
