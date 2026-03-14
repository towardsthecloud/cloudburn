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
- Static-capable rules with `evaluateStatic` must declare `staticDependencies`.
- Discovery-capable rules with `evaluateLive` must declare `discoveryDependencies`.
- Rules must not declare Terraform type strings, CloudFormation type strings, Resource Explorer `resourceTypes`, or loader wiring directly.
- Static evaluators should read from `StaticEvaluationContext.resources.get('<dataset-key>')`.
- Discovery evaluators should read from `LiveEvaluationContext.resources.get('<dataset-key>')`.

## Testing Layers

Vitest across all three packages. When adding or modifying a rule, all three test layers must be updated:

1. `exports.test.ts`
2. `rule-metadata.test.ts`
3. `{rule-name}.test.ts`

Mock boundaries:

| Package            | What to mock                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `@cloudburn/rules` | Nothing — pure unit tests                                                                                        |
| `@cloudburn/sdk`   | Static dataset loaders/orchestration seams, Resource Explorer catalog helpers, discovery hydrators, `loadConfig` |
| `cloudburn` (cli)  | `CloudBurnClient.scanStatic()` / `.discover()`                                                                   |

## Build Pipeline

`pnpm verify` = `pnpm lint && pnpm typecheck && pnpm test`. This is the gate before committing.

## Formatter and Exit Code Contract

All stdout-producing commands should build a typed `CliResponse` and render it through the shared `renderResponse(response, format)` pipeline.

Supported stdout formats are `text`, `json`, and `table` only.

- `--format` is a global CLI option, with command-local compatibility aliases allowed only to preserve post-command placement.
- `text` output should remain tab-delimited for row-like data.
- `table` output should remain stable ASCII tables, including `rules list`.
- Runtime errors should continue to emit the JSON `stderr` envelope rather than following the selected stdout format.

Exit codes:

- `0` — clean scan, or `--exit-code` not passed
- `1` — findings exist and `--exit-code` was passed
- `2` — runtime error

`--exit-code` counts nested matches across all providers and rules.

## Config System

- `.cloudburn.yml` and `.cloudburn.yaml` are both supported; treat both present in one directory as a real bug.
- Config is mode-specific: only `iac` and `discovery` are valid top-level sections.
- Rule references in config and CLI overrides must use stable public rule IDs such as `CLDBRN-AWS-EBS-1`.
- `scan` and `discover` accept `--config`, `--enabled-rules`, `--disabled-rules`, and `--service`; these runtime overrides should take precedence over file config for the same field.
- `buildRuleRegistry(config, mode)` must stay mode-aware. Reviewers should flag regressions that accidentally re-enable unsupported rules.
- Service filtering belongs in the mode-local registry selection path, not in provider runners after datasets have already been loaded.
- `customRules` is still not implemented. That gap is intentional and should not be flagged unless a change claims to add it.
