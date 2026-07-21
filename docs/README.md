# Documentation

This catalog is the canonical entry point for repository knowledge. Keep pages purpose-specific and update this index when
adding, moving, or retiring durable documentation.

## Start here

- [Project README](../README.md) — product overview, installation, and first commands.
- [Contributing](../CONTRIBUTING.md) — contributor workflow and pull request expectations.
- [Architecture](ARCHITECTURE.md) — package graph, responsibilities, and request flows.
- [Testing](TESTING.md) — package test strategy, seams, and validation scope.

## Architecture

- [CLI](architecture/cli.md) — command tree, formatting, configuration flags, and exit codes.
- [SDK](architecture/sdk.md) — scanner, config, parsing, registry, and AWS orchestration.
- [Rules](architecture/rules.md) — rule contracts, assembly, presets, and evaluation contexts.

## Guides

- [Local development](guides/local-development.md) — prerequisites, setup, focused work, and checks.
- [Adding a rule](guides/adding-a-rule.md) — identifiers, implementation, registration, documentation, and tests.
- [Adding a static dataset](guides/adding-a-static-dataset.md) — normalized Terraform and CloudFormation data.
- [Adding a provider resource](guides/adding-a-provider-resource.md) — live AWS discovery datasets and hydration.
- [Releasing](guides/releasing.md) — changesets, automated release PRs, publishing, and Homebrew updates.

## Reference

- [Commands](reference/commands.md) — supported root commands, Turbo filters, and side effects.
- [Generated files](reference/generated-files.md) — authoritative inputs and regeneration commands.
- [Configuration schema](reference/config-schema.md) — fields, defaults, loading, validation, and merge behavior.
- [Rule IDs](reference/rule-ids.md) — current rules, sequence convention, preset, and compatibility status.
- [Finding shape](reference/finding-shape.md) — public finding and scan result contracts.

## Package entry points

| Package            | Instructions                                                      | Human README                                                      |
| ------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `cloudburn`        | [`packages/cloudburn/AGENTS.md`](../packages/cloudburn/AGENTS.md) | [`packages/cloudburn/README.md`](../packages/cloudburn/README.md) |
| `@cloudburn/sdk`   | [`packages/sdk/AGENTS.md`](../packages/sdk/AGENTS.md)             | [`packages/sdk/README.md`](../packages/sdk/README.md)             |
| `@cloudburn/rules` | [`packages/rules/AGENTS.md`](../packages/rules/AGENTS.md)         | [`packages/rules/README.md`](../packages/rules/README.md)         |

## Maintenance

- Document verified current behavior, not plans or temporary implementation history.
- Prefer executable sources such as package manifests, tests, and workflows when prose disagrees.
- Run `pnpm docs:check && pnpm docs:test` after documentation changes.
