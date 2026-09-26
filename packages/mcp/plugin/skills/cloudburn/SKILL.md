---
name: cloudburn
description: Find and fix AWS cost waste with CloudBurn. Use when reviewing Terraform or CloudFormation for cost issues before deployment, checking a live AWS account or region for idle, oversized, or outdated resources, explaining a CloudBurn finding or rule ID (CLDBRN-...), or setting up CloudBurn rules and suppressions.
---

# CloudBurn

CloudBurn evaluates AWS resources against cost rules. It scans infrastructure as code before deployment and
live AWS resources after deployment with the same rule catalog. Every scan is read-only.

## Choose the scan

| Situation                                                                       | Use                | AWS access              |
| ------------------------------------------------------------------------------- | ------------------ | ----------------------- |
| Terraform (`.tf`) or CloudFormation (`.yaml`, `.yml`, `.json`) in the workspace | `scan_iac`         | None                    |
| Deployed resources in an AWS account                                            | `discover`         | Ambient AWS credentials |
| `discover` reports missing or partial Resource Explorer setup                   | `discovery_status` | Ambient AWS credentials |
| Which rules exist, or what a rule ID means                                      | `list_rules`       | None                    |

Prefer `scan_iac` when the user is changing IaC. Use `discover` only when the user asks about deployed
resources, because it reads the account and region selected by the credentials the MCP server started with.

### Without the MCP tools

When the `cloudburn` MCP tools are unavailable, run the CLI with JSON output. Use `cloudburn` when it is on
`PATH`; otherwise use `npx -y cloudburn`. It requires Node.js 24 or later.

```bash
cloudburn scan <path> --format json
cloudburn discover --region <region> --format json
cloudburn discover status --format json
cloudburn rules list --format json
```

## Review IaC

1. Scan the files or directory the user is changing: `scan_iac` with an absolute `path`. When the project has a
   `.cloudburn.yml`, pass its absolute path as `configPath`. Narrow with `enabledRules`, `disabledRules`, or
   `services` only when the user asks.
2. Report each finding with its rule ID, severity, resource, and `location` (`path:line`). Explain the cost
   impact from the rule `message`; do not invent savings figures. Report `impact` only when a finding has it.
3. Propose the smallest IaC edit that resolves the finding, apply it when the user agrees, then scan again to
   confirm the finding is gone.
4. Mention `diagnostics`: they list files CloudBurn could not parse, which means those files were not checked.

Suppress a finding only when the user decides to accept it. Put the directive with a reason directly above or
inside the Terraform or CloudFormation YAML resource. CloudFormation JSON cannot hold suppressions.

```hcl
# cloudburn-ignore CLDBRN-AWS-EBS-1 migration scheduled for Q3
resource "aws_ebs_volume" "legacy" {
  type = "gp2"
}
```

Suppressed findings stay visible under `suppressed` in the result.

## Check a live account

1. Before the first `discover`, tell the user which AWS profile and region the scan will use and confirm it is
   the intended account. Pass `region` when the user names one, and `configPath` as for IaC scans.
2. If `discover` fails with a Resource Explorer error, run `discovery_status` and explain the gap. Setup creates
   Resource Explorer indexes in the account, so never run `cloudburn discover init` yourself. Ask the user to run
   it.
3. On `CREDENTIALS_ERROR`, ask the user to refresh their AWS session and restart the MCP server with the
   intended `AWS_PROFILE` or `AWS_REGION`.
4. Present findings by severity with the account, region, resource ID, and `actionType`. CloudBurn only reports
   recommendations. Never delete, stop, resize, or purchase anything on the user's behalf without an explicit
   request, and point out rollback considerations for destructive actions.
5. Check `diagnostics` and `capabilities` for rules that could not run, for example Cost Optimization Hub rules
   in an unenrolled account, and say which checks are missing.

Discovery runs up to five minutes by default. Use `timeoutSeconds` for large accounts and `cache: "refresh"`
only when the user needs fresh evidence.

## Result shape

Both scans return `ScanResult` JSON:

- `providers[].rules[]`: one group per rule with `ruleId`, `service`, `severity`, `source`, `message`, and
  `findings[]`.
- `findings[]`: `resourceId` plus, when known, `location`, `accountId`, `region`, `resourceType`, `actionType`,
  `recommendation`, and `impact`.
- `suppressed`, `diagnostics`, `policy`, `evidence`, and `capabilities` appear only when relevant.

An empty `providers` array means no active findings for the rules that ran.

## Configure rules

A `.cloudburn.yml` in the project root configures both the CLI and these tools. The MCP tools accept only absolute
paths and rely on `configPath` to find the file, because agents start the server in different working directories.

```yaml
iac:
  disabled-rules:
    - CLDBRN-AWS-EBS-1
  fail-on: high
discovery:
  services:
    - ec2
    - s3
```

Rule IDs are stable. Opt-in rules, such as the Cost Optimization Hub rules, run only when named in
`enabled-rules` or `enabledRules`.
