# CloudBurn

Know what you spend. Fix what you waste.

CloudBurn is an open-source cloud cost policy engine. It helps teams catch optimization issues early in CI before you deploy and apply the same policies to scan live AWS environments.

## Why CloudBurn

- Open-source scanner (`cloudburn` (cli), `@cloudburn/sdk`, `@cloudburn/rules`) under Apache-2.0.
- Works standalone for IaC policy scanning and live AWS optimization checks.
- Policy-as-code workflow with stable rule IDs, mode-specific config, and CLI overrides.

## Packages

| Package            | Purpose                                        |
| ------------------ | ---------------------------------------------- |
| `cloudburn` (cli)  | User-facing CLI commands and output formatters |
| `@cloudburn/sdk`   | Scanner orchestration API for integrations     |
| `@cloudburn/rules` | Provider rule definitions and built-in presets |

## Quickstart

### Prerequisites

- Node.js >= 24
- pnpm >= 10

### Install

```bash
pnpm install
pnpm build
```

`pnpm install` runs the root `prepare` script and installs the Husky git hooks for
local development. If hooks are missing because install scripts were skipped, run:

```bash
pnpm prepare
```

### Run CLI (workspace)

```bash
pnpm --filter cloudburn exec cloudburn scan .
```

### Example commands

```bash
cloudburn scan ./main.tf
cloudburn scan ./template.yaml
cloudburn scan ./iac
cloudburn discover
cloudburn discover --region all
cloudburn discover --config .cloudburn.yml --enabled-rules CLDBRN-AWS-EBS-1
cloudburn --format json scan ./iac
cloudburn scan ./iac --disabled-rules CLDBRN-AWS-S3-1
cloudburn discover list-enabled-regions --format text
cloudburn init
cloudburn init config
cloudburn init config --print
cloudburn rules list
```

Supported output formats:

- `table` for human-readable terminal output
- `text` for tab-delimited output that works well with `grep`, `sed`, and `awk`
- `json` for machine-readable output in automation and downstream systems

JSON scan output is grouped as `providers -> rules -> findings`, with `ruleId`, `service`, `source`, and `message` on each rule group and only varying fields on each nested finding. `--format` is a global CLI option and defaults to `table`; `cloudburn init` and `cloudburn init config --print` keep raw YAML text by default so they can still be redirected into `.cloudburn.yml`.

## Configuration

CloudBurn reads `.cloudburn.yml` or `.cloudburn.yaml`. By default it searches upward from the current directory until it finds a config file or reaches the git root. Use `--config <path>` on `scan` or `discover` to load an exact file instead.

```yaml
iac:
  enabled-rules:
    - CLDBRN-AWS-EBS-1
  disabled-rules:
    - CLDBRN-AWS-EC2-2
  format: table

discovery:
  disabled-rules:
    - CLDBRN-AWS-S3-1
  format: json
```

- `enabled-rules` restricts a mode to only the listed rule IDs.
- `disabled-rules` subtracts rule IDs from the active set for that mode.
- `format` sets the default output format for that mode unless `--format` is passed.
- Rule references must use stable public IDs such as `CLDBRN-AWS-EBS-1`.
- `scan` and `discover` also accept `--enabled-rules`, `--disabled-rules`, and `--config` for one-off overrides.

Static IaC parsing now auto-detects Terraform and CloudFormation files, extracts
AWS resources into a generic catalog for rule evaluation, and supports mixed
directories. Rule coverage still depends on implemented evaluators, and
Terraform expression resolution is still being added.

## Development

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify
```

## Architecture

- Public architecture overview: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Turborepo pipeline guide: [docs/TURBOREPO.md](docs/TURBOREPO.md)
- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[Apache-2.0](LICENSE)
