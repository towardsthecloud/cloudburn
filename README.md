# CloudBurn

Know what you spend. Fix what you waste.

CloudBurn is an open-source cloud cost policy engine. It helps teams catch optimization issues early in CI before you deploy and apply the same policies to scan live AWS environments.

## Why CloudBurn

- Open-source scanner (`@cloudburn/cli`, `@cloudburn/sdk`, `@cloudburn/rules`) under Apache-2.0.
- Works standalone for IaC policy scanning and live AWS optimization checks.
- Policy-as-code workflow with profiles, severity overrides, and custom rules.

## Packages

| Package            | Purpose                                        |
| ------------------ | ---------------------------------------------- |
| `@cloudburn/cli`   | User-facing CLI commands and output formatters |
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

### Run CLI (workspace)

```bash
pnpm --filter @cloudburn/cli exec cloudburn scan .
```

### Example commands

```bash
cloudburn scan ./terraform
cloudburn scan --live
cloudburn scan --format sarif --exit-code
cloudburn init
cloudburn rules list
```

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

## Development

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify
```

## Architecture

- Public architecture overview: [docs/architecture.md](docs/architecture.md)
- Turborepo pipeline guide: [docs/turborepo.md](docs/turborepo.md)
- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[Apache-2.0](LICENSE)
