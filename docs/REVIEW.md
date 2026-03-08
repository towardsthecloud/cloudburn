# Code Review Guide

<!-- Rules below are included as context for devin.ai for finding bugs  -->

Non-obvious conventions and constraints that reviewers must enforce. If a rule here isn't violated, don't flag it — focus on real issues.

## Architecture Boundaries

Dependency direction is **`cli -> sdk -> rules`**. No reverse imports. This is enforced two ways:

1. **Turborepo boundaries** (`turbo.json`) — packages are tagged `layer:rules`, `layer:sdk`, `layer:cli` with deny rules preventing reverse imports. `turbo boundaries check` catches violations.
2. **Biome lint rule** (`biome.jsonc`) — `noRestrictedImports` blocks the CLI from importing `@cloudburn/rules` directly. The CLI must go through `@cloudburn/sdk`.

| Package            | Owns                                                 | Must NOT contain                                 |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------ |
| `cloudburn` (cli)  | Commands, formatters, exit codes                     | Scan logic, rule definitions, config loading     |
| `@cloudburn/sdk`   | Scanner facade, config, engine, parsers, discoverers | Rule definitions, CLI concerns                   |
| `@cloudburn/rules` | Rule declarations, finding types, helpers, presets   | I/O, AWS SDK calls, engine logic, config loading |

`@cloudburn/rules` must be **pure** — no I/O, no AWS SDK, no engine imports. Context types and evaluator functions only.

## Finding Shape Gotchas

Output is a three-level hierarchy: `providers -> rules -> findings`.

- `source` (`'discovery' | 'iac'`) and `message` live on the **rule group** (`Finding`), not on `FindingMatch` or `ScanResult`.
- Evaluators return **one grouped `Finding` or `null`** — never a flat array, never an empty `findings: []`.
- `accountId` and `region` must be **omitted** when unavailable — empty strings are wrong.
- `SourceLocation` only appears on IaC findings, never on live discovery findings.
- Clean scans return `{ providers: [] }` — not `null`, not a missing key.

## Rule Conventions

- All rules must use `createRule()` — raw object literals are rejected.
- Rule IDs follow `CLDBRN-{PROVIDER}-{SERVICE}-{N}` (e.g. `CLDBRN-AWS-EC2-1`). No zero-padding.
- IDs are **permanent** — never renumber, even if a rule is removed. Gaps are allowed.
- Rule names describe the **policy** ("EBS Volume Type Not Current Generation"), not the remediation ("Migrate to gp3").
- The canonical `message` is set once on the `Rule` object. It must work for both `discovery` and `iac` sources.
- Only implement evaluators for modes declared in `supports`. If `supports: ['discovery']`, there must be no `evaluateStatic`.
- Adding a rule to the `awsRules` spread automatically includes it in `awsCorePreset` — no manual preset update needed.

## Testing Layers

Vitest across all three packages. When adding or modifying a rule, **all three test layers must be updated**:

1. **`exports.test.ts`** — validates export surface (`awsRules` non-empty, preset count matches).
2. **`rule-metadata.test.ts`** — validates every rule has non-empty `id`, `name`, `description`, `supports`.
3. **`{rule-name}.test.ts`** — behavior tests for individual evaluators.

Fixture builder pattern: each test defines `create{Resource}(overrides?)` where defaults represent the **positive case** (triggers a finding). Override to the negative case to test "no findings".

Mock boundaries:

| Package            | What to mock                                                                            |
| ------------------ | --------------------------------------------------------------------------------------- |
| `@cloudburn/rules` | Nothing — pure unit tests                                                               |
| `@cloudburn/sdk`   | `discoverAwsEbsVolumes`, `parseTerraform`, `loadConfig` — no real AWS calls or file I/O |
| `cloudburn` (cli)  | `CloudBurnScanner.scanStatic()` / `.scanLive()` — do not re-test SDK internals          |

## Build Pipeline

`pnpm verify` = `pnpm lint && pnpm typecheck && pnpm test`. This is the gate before committing.

**`typecheck` and `test` both depend on `^build`** — upstream packages must be built first. If you see strange type errors after a dependency change, run `pnpm build` first.

| Task        | `dependsOn` | Cached | Notes                                                |
| ----------- | ----------- | ------ | ---------------------------------------------------- |
| `build`     | `^build`    | Yes    | `tsup`, dual ESM/CJS for sdk/rules, ESM-only for CLI |
| `typecheck` | `^build`    | Yes    | Needs upstream `dist/`                               |
| `test`      | `^build`    | Yes    | Needs upstream `dist/`                               |
| `lint`      | none        | Yes    | Biome only                                           |

Cache is invalidated by changes to `tsconfig.base.json`, `biome.jsonc`, `pnpm-lock.yaml`, or root `package.json`.

## Formatter and Exit Code Contract

All formatters share the signature `(result: ScanResult) => string`. Available: `formatJson`, `formatTable`, `formatSarif`.

Exit codes:

- `0` — clean scan, or `--exit-code` not passed
- `1` — findings exist and `--exit-code` was passed
- `2` — runtime error

`--exit-code` counts **nested matches across all providers and rules** — not per-provider or per-rule.

## Changeset and Versioning

Published packages: `cloudburn` (cli), `@cloudburn/sdk`, `@cloudburn/rules`. They version independently.

A PR that changes a published package **requires a `.changeset/*.md` file**. Write them manually — do not use the interactive prompt. Use `patch` for fixes and `minor` for features or intentional breaking changes, because this repo does not ship `major` changesets. Call out any breaking change explicitly in the changeset body. Only include packages directly changed — not transitive dependents.

## Commit Conventions

A Husky `commit-msg` hook validates format: `<type>(<scope>): <subject>`.

- **If staged changes touch exactly one package, the scope must match** — e.g. changes only in `packages/rules/` requires `(rules)`.
- If changes span multiple packages, scope is optional.
- Scope tokens: `cli` (for `packages/cloudburn`), `sdk`, `rules`.

## Code Style

- Linter/formatter: **Biome** (no ESLint, no Prettier).
- Single quotes, trailing commas, semicolons always, 2-space indent, 120-char line width.
- TSDoc docstrings on all exports.
- TypeScript strict mode with `noUncheckedIndexedAccess` and `noImplicitReturns`.
- Node `>=24.0.0`.

## Config System (Partial Implementation)

Several config fields are declared in the type but not yet wired:

- `profiles` — parsed but not applied by rule registry
- `rules` — parsed but `buildRuleRegistry` ignores it
- `customRules` — paths declared but not loaded
- `live.tags` — passed through but discoverers don't filter by it
- `loadConfig()` currently ignores the `path` argument and returns defaults

Don't flag these as bugs — they are known TODOs.
