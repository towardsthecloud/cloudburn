# Config Schema Reference

Source of truth: `packages/sdk/src/types.ts` (type), `packages/sdk/src/config/defaults.ts` (defaults), `packages/sdk/src/config/merge.ts` (merge behavior).

## `CloudBurnConfig` Fields

| Field          | Type                                         | Default | Status | Description                                                                                                        |
| -------------- | -------------------------------------------- | ------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| `version`      | `number`                                     | `1`     | Active | Config schema version. Currently always `1` (`CLOUDBURN_CONFIG_VERSION` in `schema.ts`).                           |
| `profile`      | `string`                                     | `'dev'` | Active | Active profile name. Selects which entry in `profiles` to apply.                                                   |
| `profiles`     | `Record<string, Record<string, RuleConfig>>` | `{}`    | TODO   | Named profile definitions. Each profile maps rule names to `RuleConfig` overrides. Not yet consumed by the engine. |
| `rules`        | `Record<string, RuleConfig>`                 | `{}`    | TODO   | Global rule configuration overrides. Not yet consumed by `buildRuleRegistry`.                                      |
| `customRules`  | `string[]`                                   | `[]`    | TODO   | Paths to custom rule modules. Not yet loaded by the registry.                                                      |
| `live.tags`    | `Record<string, string>`                     | `{}`    | TODO   | Tag filters for live AWS resource discovery. Passed through config but not yet used by providers.                  |
| `live.regions` | `string[]`                                   | `[]`    | Active | AWS regions to scan. Empty means auto-detect via the default EC2 client region.                                    |

`RuleConfig` is `Record<string, unknown>` — an open bag for rule-specific settings (e.g. `allow: [...]` for allowed-instance-type rules).

## Merge Behavior

`mergeConfig(partial?)` in `config/merge.ts`:

1. Start with `defaultConfig` (all defaults above).
2. Shallow-spread top-level scalar fields (`version`, `profile`, `customRules`).
3. Deep-spread `profiles` — `{ ...defaults.profiles, ...partial.profiles }`.
4. Deep-spread `rules` — `{ ...defaults.rules, ...partial.rules }`.
5. Deep-spread `live` — merge `tags` and `regions` individually.

The facade's `CloudBurnScanner` does an additional shallow spread: `{ ...await this.loadConfig(), ...config }` when a caller passes overrides directly.

## Config Loading

`loadConfig(path?)` in `config/loader.ts` currently ignores the `path` argument and returns `mergeConfig()` (pure defaults). Reading `.cloudburn.yml` from disk is a TODO.

## Starter YAML

Printed by `cloudburn init` (from `packages/cloudburn/src/commands/init.ts`):

```yaml
version: 1
profile: dev

profiles:
  dev:
    ec2-allowed-instance-types:
      allow: [t3.micro, t3.small, t3.medium]

rules:
  ec2-allowed-instance-types:
    severity: error

live:
  tags:
    Project: myapp
  regions: [us-east-1]
```
