# cloudburn

CloudBurn CLI for catching cost issues before you deploy with `scan`, then running the same policies against live AWS with `discover`.

`scan` checks Terraform and CloudFormation. `discover` uses AWS Resource Explorer as a live service catalog so CloudBurn can find deployed resources and run rules against them.

## Installation

CloudBurn requires Node.js 24+.

```bash
npm install --global cloudburn
```

If you want to keep it local to a project:

```bash
npm install cloudburn
npx cloudburn scan ./main.tf
```

## Getting Started

### Config

Config is optional. By default, CloudBurn runs all checks for the mode you use.

Create a starter config with:

```bash
cloudburn config --init
```

If you want to print the current discovered config file:

```bash
cloudburn config --print
```

If you want to inspect the starter template without writing a file:

```bash
cloudburn config --print-template
```

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

Run `cloudburn discover init` first. It automatically configures AWS Resource Explorer indexes, which CloudBurn uses as its live service catalog before it evaluates rules.

By default, `cloudburn discover` runs against your active AWS region. You can pass `--region <region>` to target one explicit region.

```bash
cloudburn discover init
cloudburn discover
cloudburn discover --region eu-central-1
cloudburn discover --config .cloudburn.yml --enabled-rules CLDBRN-AWS-EBS-1
cloudburn discover --service ec2,s3
cloudburn --debug discover --region eu-central-1
cloudburn rules list
cloudburn rules list --service ec2 --source discovery
```

The CLI targets one region per run. Multi-region discovery remains available through the SDK and still needs an AWS Resource Explorer aggregator plus an unfiltered default view in the aggregator region.
Use `--debug` to print SDK and provider execution tracing to `stderr` without changing the normal `stdout` format.

## Shell Completion

Inspect the available completion subcommands:

```bash
cloudburn completion
cloudburn completion zsh --help
```

Generate a completion script for your shell and source it directly:

```bash
source <(cloudburn completion zsh)
source <(cloudburn completion bash)
cloudburn completion fish | source
```

To enable completion persistently, add one of these lines to your shell config:

```bash
# ~/.zshrc
source <(cloudburn completion zsh)

# ~/.bashrc
source <(cloudburn completion bash)

# ~/.config/fish/config.fish
cloudburn completion fish | source
```

## Docs

- Full docs: [cloudburn.io/docs](https://cloudburn.io/docs)
- Rule reference: [docs/reference/rule-ids.md](https://github.com/towardsthecloud/cloudburn/blob/main/docs/reference/rule-ids.md)
- Config reference: [docs/reference/config-schema.md](https://github.com/towardsthecloud/cloudburn/blob/main/docs/reference/config-schema.md)

## License

Apache-2.0
