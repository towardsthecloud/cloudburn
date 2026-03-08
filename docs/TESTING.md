# Testing Strategy

## Tools

- **Test runner:** Vitest (all packages)
- **Gate command:** `pnpm verify` (runs lint + typecheck + test across the monorepo)
- **TDD flow:** red-green-refactor — write a failing test first, implement the minimal code to pass, then refactor

## Three-Package Test Strategy

### `@cloudburn/rules`

Three test layers, all in `packages/rules/test/`:

| Layer                     | File                    | What it verifies                                                                        |
| ------------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| **1. Export surface**     | `exports.test.ts`       | `awsRules` is non-empty, preset rule count matches, `azureRules`/`gcpRules` are empty   |
| **2. Metadata contract**  | `rule-metadata.test.ts` | Every rule has non-empty `id`, `name`, `description`, and `supports`                    |
| **3. Evaluator behavior** | `{rule-name}.test.ts`   | Full finding payloads for both `evaluateLive` and `evaluateStatic`, plus negative cases |

**Fixture convention:** each evaluator test defines a `create{Resource}` helper that accepts `Partial<ResourceType>` overrides:

```typescript
const createVolume = (overrides?: Partial<AwsEbsVolume>): AwsEbsVolume => ({
  volumeId: 'vol-test',
  volumeType: 'gp2',
  region: 'us-east-1',
  ...overrides,
});
```

### `@cloudburn/sdk`

Mock at the provider/parser boundary — do not call real AWS APIs or read real files in unit tests.

| Boundary         | Mock strategy                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| AWS providers    | Mock `discoverAwsEbsVolumes` and other discoverers to return fixture data                      |
| Terraform parser | Mock `parseTerraform` to return `IaCResource[]` fixtures                                       |
| Config loader    | Mock `loadConfig` or pass config directly via `CloudBurnScanner`'s optional `config` parameter |

**Test focus areas:**

- `runStaticScan` — verifies the pipeline: registry + parse + context mapping + evaluation
- `runLiveScan` — verifies the pipeline: registry + discovery + evaluation
- `buildRuleRegistry` — verifies rule filtering (once implemented)
- `mergeConfig` — verifies deep merge behavior
- `CloudBurnScanner` — integration: facade delegates correctly to engine functions

### `cloudburn` (CLI)

Mock at the SDK boundary — do not run real scans.

| Boundary           | Mock strategy                                                       |
| ------------------ | ------------------------------------------------------------------- |
| `CloudBurnScanner` | Mock `.scanStatic()` / `.scanLive()` to return fixture `ScanResult` |
| `awsCorePreset`    | Use real preset (it's static data)                                  |

**Test focus areas:**

- Each command produces correct output for a given `ScanResult`
- `--format` flag selects the right formatter
- `--exit-code` sets `process.exitCode = 1` when findings exist
- `--exit-code` without findings sets `process.exitCode = 0`

## Fixture Conventions

- Fixture builders use `create{Thing}(overrides?: Partial<Type>)` pattern
- Default values represent the "positive case" (will trigger a finding)
- Override to the "negative case" for skip/no-finding assertions
- Keep fixtures minimal — only populate fields the test needs

## Running Tests

```bash
# Single package
pnpm turbo run test --filter @cloudburn/rules

# All packages
pnpm test

# Full verification gate (lint + typecheck + test)
pnpm verify
```
