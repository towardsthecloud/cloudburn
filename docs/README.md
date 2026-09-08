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
- [Startup benchmarks](reference/startup-benchmarks.md): fresh-process CLI and SDK timing distributions and module loading.
- [Generated files](reference/generated-files.md) — authoritative inputs and regeneration commands.
- [Configuration schema](reference/config-schema.md) — fields, defaults, loading, validation, and merge behavior.
- [AWS request scheduling](reference/aws-request-scheduling.md): quota scopes, local coordination, retries, environment overrides, and attempt telemetry.
- [Discovery evidence cache](reference/evidence-cache.md): reuse scopes, freshness policies, completeness, provenance, and persistence coordination.
- [Rule IDs](reference/rule-ids.md) — current rules, sequence convention, preset, and compatibility status.
- [Finding shape](reference/finding-shape.md) — public finding and scan result contracts.

## Package entry points

| Package            | Instructions                                                      | Human README                                                      |
| ------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `cloudburn`        | [`packages/cloudburn/AGENTS.md`](../packages/cloudburn/AGENTS.md) | [`packages/cloudburn/README.md`](../packages/cloudburn/README.md) |
| `@cloudburn/sdk`   | [`packages/sdk/AGENTS.md`](../packages/sdk/AGENTS.md)             | [`packages/sdk/README.md`](../packages/sdk/README.md)             |
| `@cloudburn/rules` | [`packages/rules/AGENTS.md`](../packages/rules/AGENTS.md)         | [`packages/rules/README.md`](../packages/rules/README.md)         |

## Editing sources and ownership

Use the page that owns the subject, then verify its claims against the relevant implementation, tests, and configuration.
Update that page in the same change as its source. Link to it from other entry points instead of copying the procedure.

| Change                                       | Owning guidance                                                                                                                                                     | Source to inspect or edit                                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Commands, runtime, or task caching           | [Local development](guides/local-development.md), [commands](reference/commands.md)                                                                                 | [Root manifest](../package.json), [Node pin](../.nvmrc), [Turbo tasks](../turbo.json), and package manifests                                                                                           |
| CLI options, formatting, or exit behavior    | [CLI architecture](architecture/cli.md), [CLI README](../packages/cloudburn/README.md)                                                                              | [CLI entry](../packages/cloudburn/src/cli.ts), [commands](../packages/cloudburn/src/commands/), and [CLI tests](../packages/cloudburn/test/)                                                           |
| Configuration                                | [Config reference](reference/config-schema.md)                                                                                                                      | [SDK types](../packages/sdk/src/types.ts) and [config loading, schema, defaults, and merging](../packages/sdk/src/config/)                                                                             |
| Rules, IDs, or presets                       | [Adding a rule](guides/adding-a-rule.md), [rule IDs](reference/rule-ids.md)                                                                                         | [Rule declarations](../packages/rules/src/aws/), [presets](../packages/rules/src/presets/), and [metadata tests](../packages/rules/test/rule-metadata.test.ts)                                         |
| Dataset loading or evaluation evidence       | [SDK architecture](architecture/sdk.md), [static dataset guide](guides/adding-a-static-dataset.md), [discovery dataset guide](guides/adding-a-provider-resource.md) | [Rule-facing contracts](../packages/rules/src/shared/metadata.ts) and [AWS provider registries and loaders](../packages/sdk/src/providers/aws/)                                                        |
| Public findings or scan results              | [Finding reference](reference/finding-shape.md), [SDK README](../packages/sdk/README.md)                                                                            | [Rule contracts](../packages/rules/src/shared/metadata.ts), [SDK types](../packages/sdk/src/types.ts), and [engine](../packages/sdk/src/engine/)                                                       |
| Generated output or releases                 | [Generated files](reference/generated-files.md), [release guide](guides/releasing.md)                                                                               | Package build configs, [Changesets config](../.changeset/config.json), and [release workflow](../.github/workflows/release.yml)                                                                        |
| Validation or documentation checks           | [Testing](TESTING.md), [commands](reference/commands.md)                                                                                                            | [CI workflow](../.github/workflows/ci.yml), [checker](../scripts/check-docs.mjs), and [checker tests](../test/docs-check.test.mjs)                                                                     |
| AWS request admission, retries, or telemetry | [AWS request scheduling](reference/aws-request-scheduling.md)                                                                                                       | [Request module](../packages/sdk/src/providers/aws/request.ts), [policies](../packages/sdk/src/providers/aws/request-policy.ts), and [local state](../packages/sdk/src/providers/aws/request-store.ts) |

## Maintenance

- Keep root and package `AGENTS.md` files focused on orientation, non-obvious constraints, and links to deeper guidance.
  Preserve the relative `CLAUDE.md` aliases.
- Add, move, or retire durable pages through this catalog. Keep explanations, procedures, and reference facts on their
  owning pages; package READMEs own public package usage and the root README owns product onboarding.
- Distinguish verified behavior from intended contracts. When code and a documented contract disagree, record the gap
  and preserve the contract until intent is resolved. The [rule ID compatibility status](reference/rule-ids.md#compatibility-status)
  is an existing unresolved decision, not permission to redefine ID policy.
- Keep durable repository decisions and their rationale locally. Link to external documentation for facts owned by AWS
  or other tools. Label superseded guidance and point to its replacement when retaining useful history.
- Do not commit planning artifacts, implementation plans, or point-in-time design specs such as `docs/superpowers/`.
  Preserve useful conclusions in the owning durable page before removing disposable notes; leave unrelated deliverables alone.
- Record authoritative inputs and regeneration commands for generated outputs in the [generated-file reference](reference/generated-files.md).
- Run `pnpm docs:check && pnpm docs:test` after documentation changes. The existing checker validates local links and
  heading targets, instruction aliases, required entry points, canonical-page reachability, and the root `AGENTS.md`
  150-line limit. It does not verify external URLs, behavioral claims, or architectural intent.
- For reorganizations, follow a representative task from the entry point to its editing source, constraints, and
  validation command. A passing link check alone does not establish that the guidance is correct.
