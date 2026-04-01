# Config Schema Reference

Source of truth: `packages/sdk/src/types.ts` (type), `packages/sdk/src/config/defaults.ts` (defaults), `packages/sdk/src/config/merge.ts` (merge behavior).

## `CloudBurnConfig` Fields

| Field       | Type                   | Default | Description                                                                 |
| ----------- | ---------------------- | ------- | --------------------------------------------------------------------------- |
| `iac`       | `CloudBurnModeConfig`  | `{}`    | Default rule and format settings for `cloudburn scan`.                      |
| `discovery` | `CloudBurnModeConfig`  | `{}`    | Default rule and format settings for `cloudburn discover`.                  |

Each mode uses the same fields:

| Field            | Type                | Default | Description                                                              |
| ---------------- | ------------------- | ------- | ------------------------------------------------------------------------ |
| `enabled-rules`  | `string[]`          | unset   | If present, only the listed rule IDs remain active for that mode.        |
| `disabled-rules` | `string[]`          | unset   | Rule IDs to remove from the active set after `enabled-rules` is applied. |
| `services`       | `string[]`          | unset   | Service allowlist applied before `enabled-rules` and `disabled-rules`.   |
| `format`         | `'json' \| 'table'` | unset   | Default CLI output format for that mode when `--format` is not passed.   |

## Merge Behavior

`mergeConfig(partial?)` in `config/merge.ts`:

1. Start with `defaultConfig`.
2. Merge `iac` and `discovery` independently.
3. Replace `enabledRules` and `disabledRules` arrays when an override is present.
4. Replace `services` arrays when an override is present.
5. Preserve untouched fields in the other mode or on the same mode.

The `CloudBurnClient` facade also merges runtime overrides through `mergeConfig()`.

## Config Loading

`loadConfig(path?)` in `config/loader.ts` behaves as follows:

- explicit `path`: load that exact file
- no `path` outside CI: search upward from `process.cwd()` for `.cloudburn.yml` or `.cloudburn.yaml`
- no `path` in CI (`CI` is set to a truthy value other than `false`, `0`, or an empty string): skip implicit discovery entirely and return defaults
- stop the upward search at the git root if one exists, otherwise at the filesystem root
- if no config file is found, return defaults

Validation fails fast for:

- invalid YAML
- unknown top-level or section keys
- invalid field types
- invalid `format`
- unknown services
- unknown rule IDs
- rule IDs that do not support the targeted mode
- the same rule ID appearing in both `enabled-rules` and `disabled-rules`
- both `.cloudburn.yml` and `.cloudburn.yaml` in the same directory

## Starter YAML

Printed by `cloudburn config --print-template` (from `packages/cloudburn/src/commands/config.ts`):

```yaml
# Static IaC scan configuration.
# enabled-rules restricts scans to only the listed rule IDs.
# disabled-rules removes specific rule IDs from the active set.
# services restricts scans to rules for the listed services.
# format sets the default output format when --format is not passed.
iac:
  enabled-rules:
    - CLDBRN-AWS-EBS-1
  disabled-rules:
    - CLDBRN-AWS-EC2-2
  services:
    - ebs
    - ec2
  format: table

# Live AWS discovery configuration.
# Use the same rule controls here to tune discover runs separately from IaC scans.
discovery:
  enabled-rules:
    - CLDBRN-AWS-EBS-1
  disabled-rules:
    - CLDBRN-AWS-S3-1
  services:
    - ebs
    - s3
  format: json
```

## Live Discovery Semantics

- `cloudburn discover` defaults to the current region.
- Current region resolution order is `AWS_REGION`, `AWS_DEFAULT_REGION`, `aws_region`, then the AWS SDK region provider chain.
- Passing `--region <region>` overrides the current region for the CLI discover command.
- `discover({ target })` is the SDK live-discovery entrypoint.
- `discover({ target: { mode: 'regions', regions: [...] } })` is the SDK shape for explicit discovery regions.
- Multi-region SDK discovery requires an aggregator index and an unfiltered default Resource Explorer view in the aggregator region.
- `cloudburn discover init` defaults to the current region, accepts `--region <region>` as an override, and falls back to local-only setup in that region when cross-region aggregator setup is denied.
