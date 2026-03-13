[![CloudBurn GitHub Header](./images/cloudburn-gh-banner.png)](https://cloudburn.io)
<div align="center">
<p align="center">
  Cost optimization by policy, before you deploy with <code>scan</code> and after the fact with <code>discover</code>
  <br /><br />
</p>

[![CI](https://github.com/towardsthecloud/cloudburn/actions/workflows/ci.yml/badge.svg)](https://github.com/towardsthecloud/cloudburn/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/towardsthecloud/cloudburn/blob/main/LICENSE)
[![npm version](https://badge.fury.io/js/cloudburn.svg)](https://badge.fury.io/js/cloudburn)

[Documentation](https://cloudburn.io/docs) | [Discord](https://discord.gg/CKKK5FRW3n)

</div>

CloudBurn is an open-source cloud cost policy engine for AWS. It helps you catch cost and optimization issues before you deploy with `scan`, then run the same policies against your live environment with `discover`.

You can point it at Terraform and CloudFormation in CI, or use it after the fact to see what is still burning money in a real account.

## Features

- One rules engine for IaC and live AWS checks. Start with the [current rule list](docs/reference/rule-ids.md).
- Stable rule IDs and a documented rule model, so you can inspect how CloudBurn rules are written today. Start with the [current rule list](docs/reference/rule-ids.md) and [rule authoring guide](docs/guides/adding-a-rule.md).
- CLI support for Terraform and CloudFormation, which makes `scan` easy to wire into pull requests, CI jobs, and release pipelines.
- Live AWS discovery with `discover`, which reuses the same rules to inspect deployed resources and show what still needs fixing.
- A reusable [SDK](packages/sdk/README.md) if you want to run CloudBurn inside your own platform, internal tooling, or automation.
- Output built for both humans and machines with `table`, `text`, and `json` formats.

## See It Run

### IaC scan demo

![CloudBurn IaC scan demo](https://raw.githubusercontent.com/towardsthecloud/cloudburn/main/images/cloudburn-scan-demo.gif)

### Live discovery demo

![CloudBurn live discover demo](https://raw.githubusercontent.com/towardsthecloud/cloudburn/main/images/cloudburn-discover-demo.gif)

## Installation

CloudBurn requires Node.js 24+.

Install the CLI globally:

```bash
npm install --global cloudburn
```

If you'd rather keep it local to a project, that works too:

```bash
npm install cloudburn
```

Or run it standalone without installing it and running commands right away:

```bash
npx cloudburn scan ./main.tf
```

## Getting Started

### Config

Config is optional. By default, CloudBurn runs all checks for the mode you use.

If you want a starter config:

```bash
cloudburn init config
```

If you want to inspect the generated YAML first:

```bash
cloudburn init config --print
```

`cloudburn init` still prints starter YAML directly if you want a quick redirect-friendly version.

CloudBurn reads `.cloudburn.yml` or `.cloudburn.yaml`. Config is mode-specific, so you can tune IaC scans and live discovery separately.

```yaml
iac:
  enabled-rules:
    - CLDBRN-AWS-EBS-1
    - CLDBRN-AWS-RDS-1
  disabled-rules:
    - CLDBRN-AWS-EC2-2
  format: table

discovery:
  enabled-rules:
    - CLDBRN-AWS-EBS-1
  disabled-rules:
    - CLDBRN-AWS-S3-1
  format: json
```

- Use `enabled-rules` when you want a mode to run only a specific set of rules.
- Use `disabled-rules` when you want to subtract a few rules from the active set.
- Use stable public rule IDs like `CLDBRN-AWS-EBS-1`.
- Use `--config <path>` if you want `scan` or `discover` to load a specific config file.

### Scan

Use `scan` to check Terraform and CloudFormation before you deploy.

```bash
cloudburn scan ./main.tf
cloudburn scan ./template.yaml
cloudburn scan ./iac --exit-code
cloudburn --format json scan ./iac
```

### Discover

Use `discover` to run the same rules against live AWS resources.

Run `cloudburn discover init` first. It automatically configures AWS Resource Explorer indexes, which CloudBurn uses as its live service catalog to see which resources exist before it runs rules against them.

By default, `cloudburn discover` runs against your active AWS region. You can pass `--region <region>` to target another region, or use `--region all` to run against all indexed regions through the AWS Resource Explorer aggregator index.

```bash
cloudburn discover init
cloudburn discover
cloudburn discover --region eu-central-1
cloudburn discover --region all
cloudburn discover --config .cloudburn.yml --enabled-rules CLDBRN-AWS-EBS-1
cloudburn discover list-enabled-regions --format text
cloudburn rules list
```

`cloudburn discover --region all` needs an AWS Resource Explorer aggregator and an unfiltered default view in the aggregator region.

`scan` is static IaC only. `discover` is for live AWS environments. Rule support is per rule, so check the [rule reference](docs/reference/rule-ids.md) if you want to see which rules support `iac`, `discovery`, or both.

If you want the full config details, see the [config schema reference](docs/reference/config-schema.md). If you want the guts, the [architecture overview](docs/ARCHITECTURE.md) maps out how the CLI, SDK, and rules packages fit together.

## AWS Permissions

For full use of the CLI in AWS, CloudBurn needs:

- Resource Explorer access with read/write permissions.
- Read-only permissions for the AWS services behind the rules you enable.

That usually means Resource Explorer plus read-only access for services like EC2, EBS, RDS, S3, and Lambda, depending on which rules you're running.

## Contributing

If you want to help shape CloudBurn, start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE)
