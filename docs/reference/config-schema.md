# Config Schema Reference

Source of truth: `packages/sdk/src/types.ts` (type), `packages/sdk/src/config/defaults.ts` (defaults), `packages/sdk/src/config/merge.ts` (merge behavior).

## `CloudBurnConfig` Fields

| Field         | Type                                         | Default | Status | Description                                                                                                        |
| ------------- | -------------------------------------------- | ------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| `version`     | `number`                                     | `1`     | Active | Config schema version. Currently always `1` (`CLOUDBURN_CONFIG_VERSION` in `schema.ts`).                           |
| `profile`     | `string`                                     | `'dev'` | Active | Active profile name. Selects which entry in `profiles` to apply.                                                   |
| `profiles`    | `Record<string, Record<string, RuleConfig>>` | `{}`    | TODO   | Named profile definitions. Each profile maps rule names to `RuleConfig` overrides. Not yet consumed by the engine. |
| `rules`       | `Record<string, RuleConfig>`                 | `{}`    | TODO   | Global rule configuration overrides. Not yet consumed by `buildRuleRegistry`.                                      |
| `customRules` | `string[]`                                   | `[]`    | TODO   | Paths to custom rule modules. Not yet loaded by the registry.                                                      |

`RuleConfig` is `Record<string, unknown>` — an open bag for rule-specific settings and future per-rule overrides.

## Merge Behavior

`mergeConfig(partial?)` in `config/merge.ts`:

1. Start with `defaultConfig`.
2. Shallow-spread top-level scalar fields (`version`, `profile`, `customRules`).
3. Deep-spread `profiles`.
4. Deep-spread `rules`.

The `CloudBurnClient` facade also merges runtime overrides through `mergeConfig()`.

## Config Loading

`loadConfig(path?)` in `config/loader.ts` currently ignores the `path` argument and returns `mergeConfig()` (pure defaults). Reading `.cloudburn.yml` from disk is still a TODO.

## Starter YAML

Printed by `cloudburn init` (from `packages/cloudburn/src/commands/init.ts`):

```yaml
version: 1
profile: dev

rules:
  ec2-instance-type-preferred:
    severity: error
```

## Live Discovery Semantics

- `cloudburn discover` defaults to the current region.
- Current region resolution order is `AWS_REGION`, `AWS_DEFAULT_REGION`, `aws_region`, then the AWS SDK region provider chain.
- `discover({ target })` is the SDK live-discovery entrypoint.
- `--region all` requires an aggregator index and an unfiltered default Resource Explorer view in the aggregator region.
