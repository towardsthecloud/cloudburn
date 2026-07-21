# AGENTS.md

CloudBurn is a pnpm/Turborepo monorepo for a CLI, SDK, and pure rule package that detect AWS cost issues in IaC and live
accounts. Treat repository documentation and executable configuration as the system of record.

## Repository knowledge map

| Area                | Document                                                                                                  | Use it for                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Documentation index | [`docs/README.md`](docs/README.md)                                                                        | Complete catalog and documentation policy                   |
| Architecture        | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                                                            | Package graph, responsibilities, and scan flows             |
| Local development   | [`docs/guides/local-development.md`](docs/guides/local-development.md)                                    | Prerequisites, setup, focused work, and validation          |
| Testing             | [`docs/TESTING.md`](docs/TESTING.md)                                                                      | Test layers, seams, fixtures, and TDD expectations          |
| Commands            | [`docs/reference/commands.md`](docs/reference/commands.md)                                                | Root commands, Turbo filters, boundaries, and side effects  |
| Generated files     | [`docs/reference/generated-files.md`](docs/reference/generated-files.md)                                  | Source-to-output ownership and regeneration                 |
| Rule IDs            | [`docs/reference/rule-ids.md`](docs/reference/rule-ids.md)                                                | Current identifiers, sequence policy, and compatibility gap |
| CLI package         | [`packages/cloudburn/AGENTS.md`](packages/cloudburn/AGENTS.md) · [`README`](packages/cloudburn/README.md) | CLI boundaries and public usage                             |
| SDK package         | [`packages/sdk/AGENTS.md`](packages/sdk/AGENTS.md) · [`README`](packages/sdk/README.md)                   | SDK contracts and public usage                              |
| Rules package       | [`packages/rules/AGENTS.md`](packages/rules/AGENTS.md) · [`README`](packages/rules/README.md)             | Rule authoring constraints and public usage                 |

## Documentation policy

- Keep this file a concise map. Put durable explanations, procedures, and reference facts under `docs/`.
- Update docs in the same change as behavior, architecture, configuration, commands, generated outputs, or operational
  procedures.
- Add every durable document to `docs/README.md`; `pnpm docs:check` enforces links, reachability, aliases, and this file's
  150-line limit.
- Preserve each relative `CLAUDE.md -> AGENTS.md` symlink. Do not maintain copied instruction files.
- Do not commit planning artifacts, implementation plans, or point-in-time design specs such as `docs/superpowers/`.

## Working in this repository

- Dependency direction is `cloudburn CLI -> @cloudburn/sdk -> @cloudburn/rules`; `pnpm exec turbo boundaries` enforces it.
- Follow the nearest package `AGENTS.md` when changing files under `packages/`.
- Add TSDoc purpose, parameters, and return values to exported code.
- On non-`main` branches, use red-green TDD for behavior changes and work in vertical slices.
- For IaC rules, cover both Terraform and CloudFormation inputs.
- Confirm rule IDs and config shapes in code and references. Current IDs are contiguous by service, but their long-term
  stability policy is unresolved; see the rule ID reference before changing identifiers.
- If a search is empty or unexpectedly narrow, retry with a broader pattern before concluding.

## Validation

- Documentation only: `pnpm docs:check && pnpm docs:test`.
- Package boundaries: `pnpm exec turbo boundaries`.
- Behavior, tests, dependencies, or build configuration: `pnpm verify` plus the smallest relevant focused test.
- Do not claim completion without a fresh successful check from this worktree.

## Git and releases

- Do not commit or open a pull request on `main` unless explicitly asked. On other branches, commit each meaningful set of
  edits with a Conventional Commit; use the package scope for package changes.
- Pull requests target `main`, use the repository template, and apply `enhancement` for `feat`, `bug` for `fix`, or
  `documentation` for `docs`.
- Published packages are `cloudburn`, `@cloudburn/sdk`, and `@cloudburn/rules`.
- User-facing package changes require one directly written changeset per affected package; documentation-only changes do
  not. Never run versioning or publishing commands in a feature task.
- See [`docs/guides/releasing.md`](docs/guides/releasing.md) for changeset and automated release behavior.
