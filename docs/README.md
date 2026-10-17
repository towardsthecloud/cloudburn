# Documentation

This catalog is the canonical entry point for repository knowledge. Keep pages purpose-specific and update this index when
adding, moving, or retiring durable documentation.

## Start here

- [Project README](../README.md) — product overview, installation, and first commands.
- [Contributing](../CONTRIBUTING.md) — contributor workflow and pull request expectations.
- [Architecture](ARCHITECTURE.md) — package graph, responsibilities, and request flows.
- [Testing](TESTING.md) — package test strategy, seams, and validation scope.
- [Review guide](../REVIEW.md) — pull request review severity, invariants, intentional behavior, and skip rules.

## Architecture

- [CLI](architecture/cli.md) — command tree, formatting, configuration flags, and exit codes.
- [SDK](architecture/sdk.md) — scanner, config, parsing, registry, and AWS orchestration.
- [SDK live scan](architecture/live-scan.md) — live discovery steps, targeting, deadlines, concurrency, and per-service loaders.
- [SDK live metric evidence](architecture/live-metrics.md) — ELB request activity and CloudWatch metric collection.
- [Rules](architecture/rules.md) — rule contracts, assembly, presets, and evaluation contexts.

## Guides

- [Local development](guides/local-development.md) — prerequisites, setup, focused work, and checks.
- [Adding a rule](guides/adding-a-rule.md) — identifiers, implementation, registration, documentation, and tests.
- [Adding a static dataset](guides/adding-a-static-dataset.md) — normalized Terraform and CloudFormation data.
- [Adding a provider resource](guides/adding-a-provider-resource.md) — live AWS discovery datasets and hydration.
- [Releasing](guides/releasing.md) — changesets, publishing, selective recovery, Homebrew updates, action and plugin sync, and Marketplace and directory launch prerequisites.

## Reference

- [Commands](reference/commands.md) — supported root commands, Turbo filters, and side effects.
- [Startup benchmarks](reference/startup-benchmarks.md): fresh-process CLI and SDK timing distributions and module loading.
- [Generated files](reference/generated-files.md) — authoritative inputs and regeneration commands.
- [Configuration schema](reference/config-schema.md) — fields, defaults, loading, validation, and merge behavior.
- [AWS request scheduling](reference/aws-request-scheduling.md): quota scopes, local coordination, retries, environment overrides, and attempt telemetry.
- [Discovery evidence cache](reference/evidence-cache.md): reuse scopes, freshness policies, completeness, provenance, and persistence coordination.
- [Rule IDs](reference/rule-ids.md) — current rules, immutable IDs, allocation convention, and presets.
- [Finding shape](reference/finding-shape.md) — public finding, recommendation, impact, and precedence contracts.
- [Scan result](reference/scan-result.md) — `ScanResult` fields, evaluations, capability outcomes, and progress events.

## Package entry points

| Package | Instructions | Human README |
| --- | --- | --- |
| `cloudburn` | [`packages/cloudburn/AGENTS.md`](../packages/cloudburn/AGENTS.md) | [`packages/cloudburn/README.md`](../packages/cloudburn/README.md) |
| `@cloudburn/action` | [`packages/action/AGENTS.md`](../packages/action/AGENTS.md) | [`packages/action/README.md`](../packages/action/README.md) |
| `@cloudburn/mcp` | [`packages/mcp/AGENTS.md`](../packages/mcp/AGENTS.md) | [`packages/mcp/README.md`](../packages/mcp/README.md) |
| `@cloudburn/vscode` | [`packages/vscode/AGENTS.md`](../packages/vscode/AGENTS.md) | [`packages/vscode/README.md`](../packages/vscode/README.md) |
| `@cloudburn/sdk` | [`packages/sdk/AGENTS.md`](../packages/sdk/AGENTS.md) | [`packages/sdk/README.md`](../packages/sdk/README.md) |
| `@cloudburn/rules` | [`packages/rules/AGENTS.md`](../packages/rules/AGENTS.md) | [`packages/rules/README.md`](../packages/rules/README.md) |

## Editing sources and ownership

Use the page that owns the subject, then verify its claims against the relevant implementation, tests, and configuration.
Update that page in the same change as its source. Link to it from other entry points instead of copying the procedure.
Each row's linked sources make its linked pages due in the owning-pages check described in [Maintenance](#maintenance).
A new source file outside every linked directory makes nothing due until a row links it.

| Change | Owning guidance | Source to inspect or edit |
| --- | --- | --- |
| Commands, runtime, or task caching | [Local development](guides/local-development.md), [commands](reference/commands.md) | [Root manifest](../package.json), [Node pin](../.nvmrc), [Turbo tasks](../turbo.json), and package manifests |
| CLI commands, options, formatting, or exit behavior | [CLI architecture](architecture/cli.md), [CLI README](../packages/cloudburn/README.md) | [CLI source](../packages/cloudburn/src/), tested in `packages/cloudburn/test/` |
| Configuration | [Config reference](reference/config-schema.md) | [Config loading, schema, defaults, and merging](../packages/sdk/src/config/) and the [`config` command](../packages/cloudburn/src/commands/config.ts) |
| Rule IDs or presets | [Rule IDs](reference/rule-ids.md) | [AWS rule declarations](../packages/rules/src/aws/), [presets](../packages/rules/src/presets/), and [metadata tests](../packages/rules/test/rule-metadata.test.ts) |
| Rule contracts, helpers, or evaluation contexts | [Rules architecture](architecture/rules.md), [adding a rule](guides/adding-a-rule.md), [rules README](../packages/rules/README.md) | [Shared contracts and helpers](../packages/rules/src/shared/), [package exports](../packages/rules/src/index.ts), [AWS rule list](../packages/rules/src/aws/index.ts), and the reserved [Azure](../packages/rules/src/azure/) and [GCP](../packages/rules/src/gcp/) packs |
| SDK facade, static scan, parsing, or registries | [SDK architecture](architecture/sdk.md) | [Client facade](../packages/sdk/src/scanner.ts), [package entry](../packages/sdk/src/index.ts) and its [export type check](../packages/sdk/src/barrel-contract.ts), [built-in rule metadata](../packages/sdk/src/built-in-rules.ts), [scan policy](../packages/sdk/src/policy.ts), [engine](../packages/sdk/src/engine/), [parsers](../packages/sdk/src/parsers/), [static orchestration](../packages/sdk/src/providers/aws/static.ts), [literal values](../packages/sdk/src/providers/aws/literal-values.ts), the [static](../packages/sdk/src/providers/aws/static-registry.ts) and [discovery](../packages/sdk/src/providers/aws/discovery-registry.ts) registries, [credential scope](../packages/sdk/src/providers/aws/credentials.ts), and [region validation](../packages/sdk/src/providers/aws/regions.ts) |
| Live discovery | [SDK live scan](architecture/live-scan.md) | [Live orchestration](../packages/sdk/src/providers/aws/discovery.ts), [Resource Explorer catalog](../packages/sdk/src/providers/aws/resource-explorer.ts), [AWS clients](../packages/sdk/src/providers/aws/client.ts), [managed execution](../packages/sdk/src/providers/aws/execution.ts), [capability projection](../packages/sdk/src/providers/aws/capabilities.ts), [AWS errors](../packages/sdk/src/providers/aws/errors.ts), [error redaction](../packages/sdk/src/errors.ts), [debug tracing](../packages/sdk/src/debug.ts), [worker pools](../packages/sdk/src/utils/concurrency.ts), and [dataset loaders](../packages/sdk/src/providers/aws/resources/) |
| Live metric evidence | [SDK live metric evidence](architecture/live-metrics.md) | [Metric planner](../packages/sdk/src/providers/aws/metric-planner.ts), [CloudWatch helper](../packages/sdk/src/providers/aws/resources/cloudwatch.ts), [resource metric stage](../packages/sdk/src/providers/aws/resources/resource-metrics.ts), and [load balancer loaders](../packages/sdk/src/providers/aws/resources/elbv2.ts) |
| Public SDK API or AWS permissions | [SDK README](../packages/sdk/README.md) | [Package exports](../packages/sdk/src/index.ts), [client facade](../packages/sdk/src/scanner.ts), [public types](../packages/sdk/src/types.ts), and [AWS dataset loaders](../packages/sdk/src/providers/aws/resources/) |
| Static datasets | [Static dataset guide](guides/adding-a-static-dataset.md) | [Static registry](../packages/sdk/src/providers/aws/static-registry.ts) and [static orchestration](../packages/sdk/src/providers/aws/static.ts); dataset types in `packages/rules/src/shared/metadata.ts` |
| Live discovery datasets | [Discovery dataset guide](guides/adding-a-provider-resource.md) | [Discovery registry](../packages/sdk/src/providers/aws/discovery-registry.ts) and [client factories](../packages/sdk/src/providers/aws/client.ts); dataset types in `packages/rules/src/shared/metadata.ts` |
| Findings, recommendations, impact, or precedence | [Finding reference](reference/finding-shape.md) | [Rule contracts](../packages/rules/src/shared/metadata.ts), [recommendation](../packages/rules/src/shared/recommendation.ts) and [impact](../packages/rules/src/shared/impact.ts) helpers, [resource identity](../packages/rules/src/aws/resource-identity.ts), [finding helpers](../packages/sdk/src/findings.ts), [finding precedence](../packages/sdk/src/engine/finding-precedence.ts), and [grouping](../packages/sdk/src/engine/group-findings.ts) |
| Scan results, evaluations, capabilities, or progress | [Scan result reference](reference/scan-result.md) | [SDK types](../packages/sdk/src/types.ts), [scan policy](../packages/sdk/src/policy.ts), [live engine](../packages/sdk/src/engine/run-live.ts), [evaluation projections](../packages/sdk/src/providers/aws/discovery-registry.ts), and [capability projection](../packages/sdk/src/providers/aws/capabilities.ts) |
| AWS request admission, retries, or telemetry | [AWS request scheduling](reference/aws-request-scheduling.md) | [Request module](../packages/sdk/src/providers/aws/request.ts), [policies](../packages/sdk/src/providers/aws/request-policy.ts), [local state](../packages/sdk/src/providers/aws/request-store.ts), [attribution](../packages/sdk/src/providers/aws/request-attribution.ts), and the [request benchmark](../packages/sdk/scripts/benchmark-aws-requests.ts) |
| Discovery evidence cache | [Evidence cache](reference/evidence-cache.md) | [Cache stores](../packages/sdk/src/evidence-cache.ts), [AWS evidence reuse](../packages/sdk/src/providers/aws/evidence.ts), and [metric cache](../packages/sdk/src/providers/aws/metric-cache.ts) |
| GitHub Action behavior | [Action README](../packages/action/README.md), [package instructions](../packages/action/AGENTS.md) | [Action manifest](../packages/action/action.yml) and [source](../packages/action/src/) |
| MCP server or agent plugin | [MCP README](../packages/mcp/README.md), [package instructions](../packages/mcp/AGENTS.md) | [Server source](../packages/mcp/src/), [plugin source](../packages/mcp/plugin/), and [plugin build](../packages/mcp/scripts/build-plugin.mjs) |
| VS Code extension behavior | [Extension README](../packages/vscode/README.md), [package instructions](../packages/vscode/AGENTS.md) | [Extension source](../packages/vscode/src/) and [manifest preparation](../packages/vscode/scripts/prepare-extension.mjs); contributed settings live in `packages/vscode/package.json` |
| Generated output | [Generated files](reference/generated-files.md) | [Action bundle](../packages/action/tsup.config.ts), [plugin build](../packages/mcp/scripts/build-plugin.mjs), [extension manifest preparation](../packages/vscode/scripts/prepare-extension.mjs), [extension bundle](../packages/vscode/tsup.config.ts), [VSIX file list](../packages/vscode/.vscodeignore), and other package build configs |
| Releases | [Release guide](guides/releasing.md) | [Changesets config](../.changeset/config.json), [changelog wrapper](../scripts/changelog.cjs), [release workflow](../.github/workflows/release.yml), and [extension release workflow](../.github/workflows/vscode-release.yml) |
| CI validation | [Testing](TESTING.md), [commands](reference/commands.md) | [CI workflow](../.github/workflows/ci.yml) |
| Documentation checks | [Maintenance](#maintenance), [testing](TESTING.md), [commands](reference/commands.md) | [Link checker](../scripts/check-docs.mjs), [owning-pages check](../scripts/check-owning-pages.mjs), their [link checker tests](../test/docs-check.test.mjs) and [owning-pages tests](../test/owning-pages.test.mjs), the [documentation workflow](../.github/workflows/documentation.yml), and the [pull request template](../.github/pull_request_template.md) |
| Startup benchmarks | [Startup benchmarks](reference/startup-benchmarks.md) | [Benchmark script](../scripts/benchmark-startup.mjs) |

## Maintenance

- Keep root and package `AGENTS.md` files focused on orientation, non-obvious constraints, and links to deeper guidance.
  Preserve the relative `CLAUDE.md` aliases.
- Skills recorded in `skills-lock.json` are upstream-managed. Run `pnpm dlx skills update --project --yes` to update them;
  the CLI owns their files and lock entries. Keep repository-specific overrides in `AGENTS.md`, not installed skill files.
  Locally authored skills outside the lockfile, such as `.agents/skills/roadmap/`, are maintained directly. Keep detailed
  examples in supporting references rather than mandatory entry-point reading.
- Add, move, or retire durable pages through this catalog. Keep explanations, procedures, and reference facts on their
  owning pages; package READMEs own public package usage and the root README owns product onboarding.
- A change to a source in [Editing sources and ownership](#editing-sources-and-ownership) makes that row's owning pages
  due: update each one the change makes false, and name every other one by path in the pull request description's
  `## Documentation` section with why it stays true. Link every owning page and source in that table and keep source
  links precise; a broad one makes pages due on unrelated changes. Name sources that should not make pages due, such as
  test directories, as code instead of links.
- Agents read the raw Markdown, so write tables without column padding (`| a | b |` and `| --- | --- |`). A formatter
  that aligns columns, such as rumdl with MD060 `style = "aligned"`, adds it back; don't commit that.
- Distinguish verified behavior from intended contracts. When code and a documented contract disagree, record the gap
  and preserve the contract until intent is resolved. The [rule ID compatibility policy](reference/rule-ids.md#compatibility-status)
  requires immutable IDs even when a rule is removed or reordered.
- Keep durable repository decisions and their rationale locally. Link to external documentation for facts owned by AWS
  or other tools. Label superseded guidance and point to its replacement when retaining useful history.
- Do not commit planning artifacts, implementation plans, or point-in-time design specs such as `docs/superpowers/`.
  Preserve useful conclusions in the owning durable page before removing disposable notes; leave unrelated deliverables alone.
- Record authoritative inputs and regeneration commands for generated outputs in the [generated-file reference](reference/generated-files.md).
- For documentation-only changes, run `pnpm docs:check && pnpm docs:test`. When `pnpm verify` applies, it includes both
  checks; do not run them separately again on unchanged inputs without a new concern. `pnpm docs:check` validates local links and
  heading targets, instruction aliases, required entry points, canonical-page reachability, and the root `AGENTS.md`
  150-line limit. It does not verify external URLs, behavioral claims, or architectural intent.
- The `Owning pages` check ([documentation workflow](../.github/workflows/documentation.yml)) runs
  [`scripts/check-owning-pages.mjs`](../scripts/check-owning-pages.mjs) on every pull request to `main`, and again
  whenever the description is edited. It fails when the branch changes a source in
  [Editing sources and ownership](#editing-sources-and-ownership) but neither changes nor names an owning page. It
  proves a page was considered, not that it is still true. `main` requires no checks, so whoever merges must see it
  pass.
- For reorganizations, follow a representative task from the entry point to its editing source, constraints, and
  validation command. A passing link check alone does not establish that the guidance is correct.
