# Testing Strategy

## Tools

- **Test runners:** Vitest for source tests; Node.js `node:test` for built CLI, installed-package, and documentation tests
- **Gate command:** `pnpm verify` (runs documentation checks, package boundaries, lint, typecheck, and every test suite)
- **TDD flow:** red-green-refactor — write a failing test first, implement the minimal code to pass, then refactor

## Three-Package Test Strategy

### `@cloudburn/rules`

Three test layers, all in `packages/rules/test/`:

| Layer                     | File                    | What it verifies                                                                          |
| ------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| **1. Export surface**     | `exports.test.ts`       | `awsRules` is non-empty, preset inclusion policy holds, `azureRules`/`gcpRules` are empty |
| **2. Metadata contract**  | `rule-metadata.test.ts` | Every rule has non-empty `id`, `name`, `description`, and `supports`                      |
| **3. Evaluator behavior** | `{rule-name}.test.ts`   | Full finding payloads for both `evaluateLive` and `evaluateStatic`, plus negative cases   |

For static IaC rules, evaluator coverage must include both Terraform-shaped and CloudFormation-shaped resources. A passing test suite for only one source kind is incomplete.

### `@cloudburn/sdk`

Mock at the provider/parser boundary — do not call real AWS APIs or read real files in unit tests.

| Boundary         | Mock strategy                                                                     |
| ---------------- | --------------------------------------------------------------------------------- |
| AWS providers    | Mock Resource Explorer catalog helpers and hydrators to return fixture data       |
| Terraform parser | Mock `parseTerraform` to return `{ resources, diagnostics }` fixtures             |
| Config loader    | Mock `loadConfig` or pass config directly via `CloudBurnClient` runtime overrides |

**Test focus areas:**

- `runStaticScan` — registry + static dataset dependency resolution + parser selection + dataset loading + evaluation
- `runLiveScan` — registry + dataset dependency resolution + Resource Explorer catalog + dataset loading + evaluation
- `buildRuleRegistry` — mode-aware rule filtering for `iac` and `discovery`
- `mergeConfig` — per-mode merge behavior and runtime override precedence
- `CloudBurnClient` — facade delegates correctly to engine and provider helpers

Split static AWS provider tests into two layers:

1. Static dataset loader tests per dataset
2. Orchestration tests in `loadAwsStaticResources`

When a new IaC rule or dataset is added, the static provider/scanner coverage should prove both Terraform and CloudFormation inputs reach the expected finding path.

Split live AWS provider tests into three layers:

1. Resource Explorer catalog tests
2. Dataset loader/hydrator tests per service
3. Orchestration tests in `discoverAwsResources`

### Discovery HTTP integration

`packages/sdk/test/discovery-http-integration.test.ts` runs the public `CloudBurnClient.discover()` method with the real catalog, hydrators, AWS serialization/deserialization, and rule evaluation. Only the AWS HTTP transport is intercepted. Synthetic JSON and XML responses cover pagination, catalog deduplication, hydration scope, findings, and denied required evidence. Unexpected requests fail the test before reaching the network. Keep focused provider unit tests for exhaustive service behavior.

### `cloudburn` (CLI)

Command tests (`*.command.test.ts`) mock the SDK boundary to isolate CLI behavior. The separate `test/e2e/` suite runs the built executable against real Terraform and CloudFormation files, without mocking the SDK or parsers.

| Boundary              | Mock strategy                                                        |
| --------------------- | -------------------------------------------------------------------- |
| `CloudBurnClient`     | Mock `.scanStatic()`, `.discover()`, and discovery helper methods    |
| `builtInRuleMetadata` | Use real built-in metadata unless explicitly testing the empty state |

**Test focus areas:**

- Each command produces correct output for a given `ScanResult`
- Root and command-local `--format` resolve to the expected `json|table` output
- Config-provided mode formats become the default when `--format` is absent
- `--config`, `--enabled-rules`, and `--disabled-rules` pass the expected runtime overrides to the SDK
- `--exit-code` sets `process.exitCode = 1` when active findings exist
- `--fail-on` and configured `fail-on` apply inclusive severity thresholds with CLI precedence
- Suppressed IaC findings remain in output but never set `process.exitCode = 1`
- Gates without qualifying active findings set `process.exitCode = 0`
- `discover supported-resource-types`, `discover init`, `discover status`, `config`, `rules list`, and `estimate` all go through the shared formatter system
- `table` output stays human-readable and `json` output stays machine-readable
- Runtime errors remain structured JSON on `stderr` regardless of stdout format

### Built CLI template tests

`pnpm test:e2e` builds the CLI and its workspace dependencies, then starts the executable in isolated temporary directories. Fixtures and reviewed finding expectations live in `packages/cloudburn/test/e2e/`. These tests cover Terraform, CloudFormation YAML and JSON, positive and negative findings, source scope, source locations, configuration, suppression, parser diagnostics, and exit codes. They use no AWS credentials or account resources.

Keep the fixture expectations independent of implementation output. Normalize only irrelevant result ordering; preserve rule IDs, resource IDs, source locations, and diagnostics. Add representative complete command flows here and keep exhaustive rule permutations in SDK/rules tests.

### Installed-package tests

`pnpm test:packages` builds and packs all three workspace packages, installs the archives into a temporary consumer project, then checks the installed CLI executable and SDK ESM/CommonJS exports with real scans. Nothing is published. Installation can access the public npm registry for runtime dependencies, so this suite is uncached and requires registry connectivity. It does not use AWS credentials or contact AWS.

## Fixture privacy

Use synthetic AWS account IDs, ARNs, credentials, and responses in committed fixtures. Do not record live account output or add real credentials, real account identifiers, or live AWS workflows to this test pipeline. The synthetic discovery fixtures use `111111111111`; this is example data.

## Running Tests

```bash
# Single package
pnpm turbo run test --filter @cloudburn/rules

# All suites (including built CLI and installed-package checks)
pnpm test

# Built CLI and real template fixtures
pnpm test:e2e

# Installed archives and public package exports
pnpm test:packages

# One discovery integration file
pnpm --filter @cloudburn/sdk exec vitest run test/discovery-http-integration.test.ts

# Repository knowledge checker and its public CLI tests
pnpm docs:check
pnpm docs:test

# Full verification gate
pnpm verify
```

`docs:test` exercises `scripts/check-docs.mjs` through its process exit status and diagnostics with isolated fixtures. The
live `docs:check` validates required entry points, root and package instruction aliases, repository-contained local links,
heading fragments, reference-style definitions and uses, code-example exclusion, canonical page reachability, and the root
`AGENTS.md` line budget.

## CI and task caching

CI installs dependencies once in a shared validation job. Pull requests run `pnpm verify --affected`; pushes to `main` run the full `pnpm verify` gate. Documentation checks and package boundaries always run. Turbo selects affected package tasks and shares required builds within the job.

Source tests resolve workspace source directly and can run without dependency builds. The `test:inputs` transit task propagates upstream source changes into downstream test cache keys without serializing their execution. Built CLI and installed-package suites depend on the CLI build, which depends on SDK/rules builds. Test fixture edits invalidate tests without rebuilding unchanged package output. See the [command reference](reference/commands.md) for task dependencies and cache policy.
