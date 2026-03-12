# Finding and ScanResult Shape Reference

Source of truth: `packages/rules/src/shared/metadata.ts` (rule contracts) and `packages/sdk/src/types.ts` (SDK scan result contracts).

## `ScanSource`

```ts
type ScanSource = 'discovery' | 'iac';
```

`source` stays on each rule-level finding group. There is no top-level `source` field on `ScanResult`.

## `SourceLocation`

```ts
type SourceLocation = {
  path: string;
  startLine: number;
  startColumn: number;
  endLine?: number;
  endColumn?: number;
};
```

IaC findings may include `location`. Live discovery findings omit it.

## `FindingMatch`

```ts
type FindingMatch = {
  resourceId: string;
  accountId?: string;
  region?: string;
  location?: SourceLocation;
};
```

| Field        | Type             | Description                                                                                                                                                 |
| ------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resourceId` | `string`         | Provider-specific resource identity. Terraform uses resource addresses today; future CloudFormation support can use logical IDs or paths in the same field. |
| `accountId`  | `string?`        | Account identifier when available. Omit it when unavailable.                                                                                                |
| `region`     | `string?`        | Region when available. Omit it when unavailable.                                                                                                            |
| `location`   | `SourceLocation` | Source coordinates for IaC matches when available.                                                                                                          |

## `Finding`

```ts
type Finding = {
  ruleId: string;
  service: string;
  source: ScanSource;
  message: string;
  findings: FindingMatch[];
};
```

This is the rule-level group returned by a rule evaluator. Empty groups are not returned; evaluators return `null` instead.

| Field      | Type             | Description                                                          |
| ---------- | ---------------- | -------------------------------------------------------------------- |
| `ruleId`   | `string`         | Stable CloudBurn rule identifier.                                    |
| `service`  | `string`         | Service name such as `ebs` or `ec2`.                                 |
| `source`   | `ScanSource`     | Whether the matches came from live discovery or static IaC analysis. |
| `message`  | `string`         | Generic rule-level policy text shared by every nested match.         |
| `findings` | `FindingMatch[]` | Nested resource-level matches for the rule.                          |

## `ProviderFindingGroup`

```ts
type ProviderFindingGroup = {
  provider: 'aws' | 'azure' | 'gcp';
  rules: Finding[];
};
```

This is the provider-level group returned by the SDK scan engines.

## `ScanResult`

```ts
type ScanResult = {
  providers: ProviderFindingGroup[];
};
```

Clean scans return:

```json
{
  "providers": []
}
```

Example non-empty shape:

```json
{
  "providers": [
    {
      "provider": "aws",
      "rules": [
        {
          "ruleId": "CLDBRN-AWS-EBS-1",
          "service": "ebs",
          "source": "iac",
          "message": "EBS volumes should use current-generation storage.",
          "findings": [
            {
              "resourceId": "aws_ebs_volume.gp2_data",
              "location": {
                "path": "main.tf",
                "startLine": 4,
                "startColumn": 3
              }
            }
          ]
        }
      ]
    }
  ]
}
```
