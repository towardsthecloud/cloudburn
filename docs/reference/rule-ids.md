# Rule ID Reference

Source of truth: rule files in `packages/rules/src/aws/`.

## ID Convention

Format: `CLDBRN-{PROVIDER}-{SERVICE}-{N}`

- All uppercase
- No zero-padding on the sequence number
- IDs are stable — no renumbering when rules are removed (gaps are allowed)
- Provider: `AWS`, `AZURE`, `GCP`
- Service: short name matching the directory (e.g. `EBS`, `EC2`, `RDS`, `S3`, `LAMBDA`)

## Rule Table

| ID                    | Name                                      | Service | Supports       | Status      |
| --------------------- | ----------------------------------------- | ------- | -------------- | ----------- |
| `CLDBRN-AWS-EC2-1`    | EC2 Instance Type Not in Allowed Profile  | ec2     | iac, discovery | Scaffold    |
| `CLDBRN-AWS-EBS-1`    | EBS Volume Type Not Current Generation    | ebs     | discovery, iac | Implemented |
| `CLDBRN-AWS-RDS-1`    | RDS Instance Class Not in Allowed Profile | rds     | iac, discovery | Scaffold    |
| `CLDBRN-AWS-S3-1`     | S3 Missing Lifecycle Configuration        | s3      | iac, discovery | Scaffold    |
| `CLDBRN-AWS-LAMBDA-1` | Lambda Cost Optimal Architecture          | lambda  | iac, discovery | Implemented |

**Status key:**

- **Implemented** — has both `evaluateLive` and `evaluateStatic` evaluators with tests
- **Scaffold** — metadata defined, no evaluator implementations yet

## Presets

| Preset ID  | Name     | Rule IDs            |
| ---------- | -------- | ------------------- |
| `aws-core` | AWS Core | All AWS rules above |

Future presets (planned): `strict`, `startup`, `production`.
