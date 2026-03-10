# Code Review Guide

<!-- Rules below are included as context for devin.ai for finding bugs  -->

Non-obvious conventions and constraints that reviewers must enforce. If a rule here isn't violated, don't flag it — focus on real issues.

## Architecture Boundaries

Dependency direction is **`cli -> sdk -> rules`**. No reverse imports.

| Package            | Owns                                                 | Must NOT contain                                 |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------ |
| `cloudburn` (cli)  | Commands, formatters, exit codes                     | Scan logic, rule definitions, config loading     |
| `@cloudburn/sdk`   | Scanner facade, config, engine, parsers, providers   | Rule definitions, CLI concerns                   |
| `@cloudburn/rules` | Rule declarations, finding types, helpers, presets   | I/O, AWS SDK calls, engine logic, config loading |

`@cloudburn/rules` must stay pure — no I/O, no AWS SDK, no engine imports.

## Finding Shape Gotchas

Output is a three-level hierarchy: `providers -> rules -> findings`.

- `source` (`'discovery' | 'iac'`) and `message` live on the rule group (`Finding`), not on `FindingMatch` or `ScanResult`.
- Evaluators return one grouped `Finding` or `null` — never a flat array, never an empty `findings: []`.
- `accountId` and `region` must be omitted when unavailable.
- `SourceLocation` only appears on IaC findings, never on live discovery findings.
- Clean scans return `{ providers: [] }`.

## Rule Conventions

- All rules must use `createRule()`.
- Rule IDs follow `CLDBRN-{PROVIDER}-{SERVICE}-{N}`. No zero-padding.
- IDs are permanent — never renumber, even if a rule is removed.
- Rule names describe the policy, not the remediation.
- The canonical `message` is set once on the `Rule` object and must work for both `discovery` and `iac`.
- Only implement evaluators for modes declared in `supports`.
- Discovery-capable rules with `evaluateLive` must declare `liveDiscovery.resourceTypes`, and declare a `hydrator` only when catalog data alone is insufficient.

## Testing Layers

Vitest across all three packages. When adding or modifying a rule, all three test layers must be updated:

1. `exports.test.ts`
2. `rule-metadata.test.ts`
3. `{rule-name}.test.ts`

Mock boundaries:

| Package            | What to mock |
| ------------------ | ------------ |
| `@cloudburn/rules` | Nothing — pure unit tests |
| `@cloudburn/sdk`   | Resource Explorer catalog helpers, hydrators, `parseTerraform`, `loadConfig` |
| `cloudburn` (cli)  | `CloudBurnClient.scanStatic()` / `.discover()` |

## Build Pipeline

`pnpm verify` = `pnpm lint && pnpm typecheck && pnpm test`. This is the gate before committing.

## Formatter and Exit Code Contract

All stdout-producing commands should build a typed `CliResponse` and render it through the shared `renderResponse(response, format)` pipeline.

Supported stdout formats are `text`, `json`, and `table` only.

- `--format` is a global CLI option, with command-local compatibility aliases allowed only to preserve post-command placement.
- `text` output should remain tab-delimited for row-like data.
- `table` output should remain stable ASCII tables, except `rules list`, which intentionally uses a grouped outline.
- Runtime errors should continue to emit the JSON `stderr` envelope rather than following the selected stdout format.

Exit codes:

- `0` — clean scan, or `--exit-code` not passed
- `1` — findings exist and `--exit-code` was passed
- `2` — runtime error

`--exit-code` counts nested matches across all providers and rules.

## Config System (Partial Implementation)

Several config fields are declared in the type but not yet wired:

- `profiles` — parsed but not applied by rule registry
- `rules` — parsed but `buildRuleRegistry` ignores it
- `customRules` — paths declared but not loaded
- `loadConfig()` currently ignores the `path` argument and returns defaults

Don't flag these as bugs — they are known TODOs.
