# Finding and ScanResult Shape Reference

Source of truth: `packages/rules/src/shared/metadata.ts` (types), `packages/sdk/src/types.ts` (SDK re-exports).

## `Finding`

```typescript
type Finding = {
  id: string;
  ruleId: string;
  message: string;
  resource: ResourceLocation;
  source: ScanSource;
};
```

| Field      | Type               | Description                                                                                         |
| ---------- | ------------------ | --------------------------------------------------------------------------------------------------- |
| `id`       | `string`           | Unique finding identifier. Format: `{ruleId}:{resourceId}`. Example: `CLDBRN-AWS-EBS-1:vol-0abc123` |
| `ruleId`   | `string`           | The rule that produced this finding. Matches `Rule.id`.                                             |
| `message`  | `string`           | Human-readable description of the issue.                                                            |
| `resource` | `ResourceLocation` | Location of the resource that triggered the finding.                                                |
| `source`   | `ScanSource`       | Which scan mode produced this finding: `'discovery'` or `'iac'`.                                    |

## `ResourceLocation`

```typescript
type ResourceLocation = {
  provider: 'aws' | 'azure' | 'gcp';
  accountId: string;
  region: string;
  service: string;
  resourceId: string;
};
```

| Field        | Type                        | Description                                                                                          |
| ------------ | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `provider`   | `'aws' \| 'azure' \| 'gcp'` | Cloud provider.                                                                                      |
| `accountId`  | `string`                    | Always `''` inside rule evaluators. The SDK injects the real account ID after evaluation.            |
| `region`     | `string`                    | AWS region for live findings (e.g. `us-east-1`). Empty string `''` for IaC findings.                 |
| `service`    | `string`                    | Service name (e.g. `ebs`, `ec2`).                                                                    |
| `resourceId` | `string`                    | Live: AWS resource ID (e.g. `vol-0abc123`). IaC: Terraform address (e.g. `aws_ebs_volume.gp2_data`). |

## `ScanSource`

```typescript
type ScanSource = 'discovery' | 'iac';
```

| Value         | Meaning                                                     |
| ------------- | ----------------------------------------------------------- |
| `'discovery'` | Finding produced by a live AWS API scan (`evaluateLive`).   |
| `'iac'`       | Finding produced by static IaC analysis (`evaluateStatic`). |

## `ScanResult`

```typescript
type ScanResult = {
  source: ScanSource;
  findings: Finding[];
};
```

| Field      | Type         | Description                                                       |
| ---------- | ------------ | ----------------------------------------------------------------- |
| `source`   | `ScanSource` | The scan mode that produced this result.                          |
| `findings` | `Finding[]`  | All findings from the scan. Empty array when no issues are found. |

The `source` field on `ScanResult` is set by the engine (`'iac'` for `runStaticScan`, `'discovery'` for `runLiveScan`). Each `Finding` inside also carries its own `source` field, which should match.
