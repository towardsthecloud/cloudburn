# Code Review Guide

<!-- Rules below are included as context for devin.ai for finding bugs  -->

Non-obvious conventions and constraints that reviewers must enforce. If a rule here isn't violated, don't flag it — focus on real issues.

## Architecture Boundaries

See [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) for the full package responsibility matrix.

Dependency direction is **`cli -> sdk -> rules`**. No reverse imports. `@cloudburn/rules` must stay pure — no I/O, no AWS SDK, no engine imports.

## Finding Shape Gotchas

Output is a three-level hierarchy: `providers -> rules -> findings`. See [`docs/reference/finding-shape.md`](reference/finding-shape.md) for full type contracts.

- `source` (`'discovery' | 'iac'`) and `message` live on the rule group (`Finding`), not on `FindingMatch` or `ScanResult`.
- Evaluators return one grouped `Finding` or `null` — never a flat array, never an empty `findings: []`.
- `accountId` and `region` must be omitted when unavailable.
- `SourceLocation` only appears on IaC findings, never on live discovery findings.
- Clean scans return `{ providers: [] }`.

## Rule Conventions

See [`docs/guides/adding-a-rule.md`](guides/adding-a-rule.md) for the full authoring guide and [`docs/reference/rule-ids.md`](reference/rule-ids.md) for ID conventions.

Key reviewer checks:

- All rules must use `createRule()`.
- Rule names describe the policy, not the remediation.
- Only implement evaluators for modes declared in `supports`.
- Rules must not declare Terraform type strings, CloudFormation type strings, Resource Explorer `resourceTypes`, or loader wiring directly.

## Testing Layers

See [`docs/TESTING.md`](TESTING.md) for the full test strategy and mock boundaries.

When adding or modifying a rule, all three `@cloudburn/rules` test layers must be updated:

1. `exports.test.ts`
2. `rule-metadata.test.ts`
3. `{rule-name}.test.ts`

## Build Pipeline

`pnpm verify` is the gate before committing.

## Formatter and Exit Code Contract

See [`docs/architecture/cli.md`](architecture/cli.md) for the full exit-code table and formatter pipeline.

All stdout-producing commands should build a typed `CliResponse` and render it through the shared `renderResponse(response, format)` pipeline.

Supported stdout formats are `json` and `table` only.

- `--format` is a global CLI option, with command-local compatibility aliases allowed only to preserve post-command placement.
- `table` output should remain stable ASCII tables, including `rules list`.
- Runtime errors should continue to emit the JSON `stderr` envelope rather than following the selected stdout format.

## Config System

- `.cloudburn.yml` and `.cloudburn.yaml` are both supported; treat both present in one directory as a real bug.
- Config is mode-specific: only `iac` and `discovery` are valid top-level sections.
- Rule references in config and CLI overrides must use stable public rule IDs such as `CLDBRN-AWS-EBS-1`.
- `scan` and `discover` accept `--config`, `--enabled-rules`, `--disabled-rules`, and `--service`; these runtime overrides should take precedence over file config for the same field.
- `buildRuleRegistry(config, mode)` must stay mode-aware. Reviewers should flag regressions that accidentally re-enable unsupported rules.
- Service filtering belongs in the mode-local registry selection path, not in provider runners after datasets have already been loaded.
- `customRules` is still not implemented. That gap is intentional and should not be flagged unless a change claims to add it.
