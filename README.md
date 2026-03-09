# CloudBurn

Know what you spend. Fix what you waste.

CloudBurn is an open-source cloud cost policy engine. It helps teams catch optimization issues early in CI before you deploy and apply the same policies to scan live AWS environments.

## Why CloudBurn

- Open-source scanner (`cloudburn` (cli), `@cloudburn/sdk`, `@cloudburn/rules`) under Apache-2.0.
- Works standalone for IaC policy scanning and live AWS optimization checks.
- Policy-as-code workflow with profiles, severity overrides, and custom rules.

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
cloudburn scan --live
cloudburn scan --format sarif --exit-code
cloudburn init
cloudburn rules list
```

JSON scan output is grouped as `providers -> rules -> findings`, with `ruleId`, `service`, `source`, and `message` on each rule group and only varying fields on each nested finding.

## Configuration

CloudBurn reads `.cloudburn.yml`.

```yaml
version: 1
profile: dev

profiles:
  dev:
    ec2-allowed-instance-types:
      allow: [t3.micro, t3.small]

rules:
  ebs-gp2-to-gp3:
    severity: error

live:
  tags:
    Project: myapp
  regions: [us-east-1]

custom_rules:
  - ./rules/
```

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
