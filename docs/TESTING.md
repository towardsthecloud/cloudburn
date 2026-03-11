# Testing Strategy

## Tools

- **Test runner:** Vitest (all packages)
- **Gate command:** `pnpm verify` (runs lint + typecheck + test across the monorepo)
- **TDD flow:** red-green-refactor — write a failing test first, implement the minimal code to pass, then refactor

## Three-Package Test Strategy

### `@cloudburn/rules`

Three test layers, all in `packages/rules/test/`:

| Layer                     | File                    | What it verifies |
| ------------------------- | ----------------------- | ---------------- |
| **1. Export surface**     | `exports.test.ts`       | `awsRules` is non-empty, preset rule count matches, `azureRules`/`gcpRules` are empty |
| **2. Metadata contract**  | `rule-metadata.test.ts` | Every rule has non-empty `id`, `name`, `description`, and `supports` |
| **3. Evaluator behavior** | `{rule-name}.test.ts`   | Full finding payloads for both `evaluateLive` and `evaluateStatic`, plus negative cases |

### `@cloudburn/sdk`

Mock at the provider/parser boundary — do not call real AWS APIs or read real files in unit tests.

| Boundary         | Mock strategy |
| ---------------- | ------------- |
| AWS providers    | Mock Resource Explorer catalog helpers and hydrators to return fixture data |
| Terraform parser | Mock `parseTerraform` to return `IaCResource[]` fixtures |
| Config loader    | Mock `loadConfig` or pass config directly via `CloudBurnClient` runtime overrides |

**Test focus areas:**

- `runStaticScan` — registry + parse + context mapping + evaluation
- `runLiveScan` — registry + dataset dependency resolution + Resource Explorer catalog + dataset loading + evaluation
- `buildRuleRegistry` — rule filtering (once implemented)
- `mergeConfig` — deep merge behavior
- `CloudBurnClient` — facade delegates correctly to engine and provider helpers

Split live AWS provider tests into three layers:

1. Resource Explorer catalog tests
2. Dataset loader/hydrator tests per service
3. Orchestration tests in `discoverAwsResources`

### `cloudburn` (CLI)

Mock at the SDK boundary — do not run real scans.

| Boundary           | Mock strategy |
| ------------------ | ------------- |
| `CloudBurnClient`      | Mock `.scanStatic()`, `.discover()`, and discovery helper methods |
| `builtInRuleMetadata` | Use real built-in metadata unless explicitly testing the empty state |

**Test focus areas:**

- Each command produces correct output for a given `ScanResult`
- Root and command-local `--format` resolve to the expected `text|json|table` output
- `--exit-code` sets `process.exitCode = 1` when findings exist
- `--exit-code` without findings sets `process.exitCode = 0`
- `discover list-enabled-regions`, `discover supported-resource-types`, `discover init`, `init`, `rules list`, and `estimate` all go through the shared formatter system
- `text` output stays tab-delimited and `table` output stays human-readable
- Runtime errors remain structured JSON on `stderr` regardless of stdout format

## Running Tests

```bash
# Single package
pnpm turbo run test --filter @cloudburn/rules

# All packages
pnpm test

# Full verification gate (lint + typecheck + test)
pnpm verify
```
