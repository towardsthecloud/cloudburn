# CloudBurn GitHub Action

Scan Terraform and CloudFormation for AWS cost issues in pull requests and CI jobs. The action annotates findings inline,
posts a sticky pull request comment, writes a step summary, and can fail the job on severity.

The action runs the same rule engine as the [CloudBurn CLI](https://github.com/towardsthecloud/cloudburn) and bundles it
at release time, so no runtime installation is needed.

Install it from the [GitHub Marketplace](https://github.com/marketplace/actions/cloudburn-scan). Full documentation lives
at [cloudburn.io/docs/cli/github-action](https://cloudburn.io/docs/cli/github-action).

## Usage

```yaml
name: cost
on: pull_request

permissions:
  contents: read
  pull-requests: write # for the findings comment

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: towardsthecloud/cloudburn-action@v1
```

Fail the job when findings at or above a severity exist:

```yaml
- uses: towardsthecloud/cloudburn-action@v1
  with:
    path: ./iac
    fail-on: high
```

## Inputs

The inputs mirror the `cloudburn scan` flags.

| Input            | Description                                                              | Default               |
| ---------------- | ------------------------------------------------------------------------ | --------------------- |
| `path`           | Terraform file, CloudFormation template, or directory to scan            | `.`                   |
| `config`         | Explicit CloudBurn config file to load (implicit discovery is off in CI) |                       |
| `enabled-rules`  | Comma-separated rule IDs to enable; when set, only these rules run       |                       |
| `disabled-rules` | Comma-separated rule IDs to disable from the AWS Core preset             |                       |
| `service`        | Comma-separated services to include in the scan rule set                 |                       |
| `fail-on`        | Fail for findings at or above `high`, `medium`, or `low`                 |                       |
| `exit-code`      | Fail when any finding exists                                             | `false`               |
| `annotations`    | Emit inline annotations for findings with a source location              | `true`                |
| `comment`        | Post or update a sticky findings comment on `pull_request` events        | `true`                |
| `header`         | Heading used for the step summary and sticky comment                     | `## CloudBurn scan`   |
| `token`          | GitHub token used to post the pull request comment                       | `${{ github.token }}` |

## Outputs

| Output             | Description                                             |
| ------------------ | ------------------------------------------------------- |
| `findings-count`   | Number of active findings                               |
| `suppressed-count` | Findings suppressed by `cloudburn-ignore` comments      |
| `failed`           | `true` when the active fail policy tripped              |
| `result-file`      | Path to the full scan result JSON                       |
| `markdown`         | Rendered markdown report of the scan                    |

## Examples

Scan only specific rules and keep the job green:

```yaml
- uses: towardsthecloud/cloudburn-action@v1
  with:
    enabled-rules: CLDBRN-AWS-EBS-1,CLDBRN-AWS-S3-1
    comment: 'false'
```

Use a config file for the rule set and policy:

```yaml
- uses: towardsthecloud/cloudburn-action@v1
  with:
    config: .cloudburn.yml
```

```yaml
# .cloudburn.yml
iac:
  enabled-rules:
    - CLDBRN-AWS-EBS-1
  fail-on: medium
```

Suppress an accepted finding inline; suppressed findings stay visible in the collapsed section of the report:

```hcl
# cloudburn-ignore CLDBRN-AWS-EBS-1 migration scheduled
resource "aws_ebs_volume" "legacy" {
  type = "gp2"
}
```

## Notes

- The action scans IaC only. Live account evaluation stays in the CLI (`cloudburn discover`).
- The sticky comment posts only on `pull_request` events and needs `pull-requests: write` permission.
- The `token` input supports the default workflow token, personal access tokens, and GitHub App installation tokens.
  Comments are matched to the token's authenticated identity. If that identity cannot be resolved, the action warns and
  skips commenting instead of updating another author's report.
- Rule IDs are stable; see the [rules documentation](https://cloudburn.io/docs/rules) for what each rule checks and
  the [rule list](https://github.com/towardsthecloud/cloudburn/blob/main/docs/reference/rule-ids.md) for ID compatibility.

## Documentation

For complete documentation, including configuration, rule selection, suppressions, and how the action relates to the
CloudBurn CLI, visit:

[Full Documentation on CloudBurn.io](https://cloudburn.io/docs/cli/github-action)

## License

[Apache-2.0](https://github.com/towardsthecloud/cloudburn-action/blob/main/LICENSE)
