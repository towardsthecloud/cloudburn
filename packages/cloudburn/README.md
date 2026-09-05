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

Config is optional. By default, CloudBurn runs the AWS Core preset for the mode you use. Rules that need explicit AWS setup stay opt-in. This includes global tagging, which needs a Resource Explorer aggregator, and Lambda memory recommendations, which need Compute Optimizer enrollment.

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

CloudBurn does not implicitly trust repository config in CI. Pass the exact file explicitly when you want CI to use
its rule selection, output defaults, or severity gate:

```bash
cloudburn scan ./iac --config .cloudburn.yml
cloudburn discover --config .cloudburn.yml
```

### Scan

Use `scan` to check Terraform and CloudFormation before you deploy.

```bash
cloudburn scan ./main.tf
cloudburn scan ./template.yaml
cloudburn scan ./iac --exit-code
cloudburn scan ./iac --fail-on high
cloudburn --format json scan ./iac
```

`--fail-on high|medium|low` exits with code 1 when an active finding meets or exceeds the selected severity. The same
threshold can be configured as `iac.fail-on`. Plain `--exit-code` continues to gate on any active finding.
In CI, configured thresholds apply only when the config is passed with `--config` as shown above.

Terraform and CloudFormation YAML support resource-local exceptions. Put one of these comments immediately above or
inside the resource; text after the directive is retained as an optional reason:

```hcl
# cloudburn-ignore CLDBRN-AWS-EBS-1 migration scheduled
resource "aws_ebs_volume" "legacy" {
  type = "gp2"
}

# cloudburn-ignore-all approved temporary exception
resource "aws_ebs_volume" "temporary" {
  type = "gp2"
}
```

Suppressed findings remain available in JSON output under `suppressed`, are counted in table output, and never fail CI
gates. CloudFormation JSON does not support comments and therefore cannot contain inline suppressions.

### Discover

Use `discover` to run the same rules against live AWS resources.

Run `cloudburn discover init` first. It automatically configures AWS Resource Explorer indexes, which CloudBurn uses as its live service catalog before it evaluates rules.

By default, `cloudburn discover` runs against your active AWS region. You can pass `--region <region>` to target one explicit region.

```bash
cloudburn discover init
cloudburn discover
cloudburn discover --region eu-central-1
cloudburn discover --config .cloudburn.yml --enabled-rules CLDBRN-AWS-EBS-1
cloudburn discover --enabled-rules CLDBRN-AWS-LAMBDA-4
cloudburn discover --enabled-rules CLDBRN-AWS-COSTOPTIMIZATIONHUB-1
cloudburn discover --enabled-rules CLDBRN-AWS-COSTOPTIMIZATIONHUB-2
cloudburn discover --enabled-rules CLDBRN-AWS-COSTOPTIMIZATIONHUB-3
cloudburn discover --enabled-rules CLDBRN-AWS-COSTOPTIMIZATIONHUB-4
cloudburn discover --enabled-rules CLDBRN-AWS-COSTOPTIMIZATIONHUB-5
cloudburn discover --enabled-rules CLDBRN-AWS-TAGGING-1
cloudburn discover --service ec2,s3
cloudburn discover --fail-on high
cloudburn --debug discover --region eu-central-1
cloudburn rules list
cloudburn rules list --service ec2 --source discovery --severity high
```

The discovery config equivalent is `discovery.fail-on`.

The CLI targets one region per run. Multi-region discovery remains available through the SDK and still needs an AWS Resource Explorer aggregator plus an unfiltered default view in the aggregator region.
`CLDBRN-AWS-TAGGING-1` is opt-in and requires an accessible aggregator; a local-only setup cannot run account-wide tagging discovery.
`CLDBRN-AWS-LAMBDA-4` is opt-in and requires AWS Compute Optimizer enrollment.
`CLDBRN-AWS-COSTOPTIMIZATIONHUB-1`, `CLDBRN-AWS-COSTOPTIMIZATIONHUB-2`, `CLDBRN-AWS-COSTOPTIMIZATIONHUB-3`, and `CLDBRN-AWS-COSTOPTIMIZATIONHUB-5` are opt-in and require AWS Cost Optimization Hub enrollment. CloudBurn checks enrollment but never changes it. These rules use `cost-optimization-hub:ListEnrollmentStatuses`, `cost-optimization-hub:ListRecommendations`, and `cost-optimization-hub:GetRecommendation`, with `Resource: "*"`, plus `sts:GetCallerIdentity` for account scoping.

Rule 3 reports idle-capacity Stop, Delete, and ScaleIn recommendations. It never executes them. Missing enrollment,
denied access, and malformed evidence produce diagnostics. Review the exact action and rollback capability before acting.
Table output includes an Action column for these findings. Regional discovery limits recommendations to the selected Region.

`CLDBRN-AWS-COSTOPTIMIZATIONHUB-5` reviews AWS `Upgrade` recommendations for standalone EC2 instances, Auto Scaling groups, EBS volumes, RDS DB instances, and RDS DB instance storage. It preserves both configurations for generation review; rightsizing and Graviton migration use separate AWS actions. Unenrolled accounts, access denial, and incomplete required details produce unavailable diagnostics.
Reservation findings include their AWS resource namespace in JSON and in the default table output.
`CLDBRN-AWS-COSTOPTIMIZATIONHUB-4` is also opt-in and uses the same Hub IAM actions for rightsizing recommendations
across EC2 instances and Auto Scaling groups, EBS, Lambda, ECS, RDS instances and storage, and Aurora cluster storage.
It reads recommendations across Regions for the current account through `us-east-1`. Missing enrollment, denied
access, or incomplete configurations produce diagnostics. The SDK exposes both typed configurations with
`includeEvaluationResources: true`; the CLI prints finding identities and diagnostics.
`CLDBRN-AWS-SAGEMAKER-3` uses Cost Explorer coverage data and remains available when Cost Optimization Hub is unavailable.
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
