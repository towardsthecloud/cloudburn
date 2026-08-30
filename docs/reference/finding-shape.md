# Finding and ScanResult Shape Reference

Source of truth: `packages/rules/src/shared/metadata.ts` (rule contracts) and `packages/sdk/src/types.ts` (SDK scan result contracts).

## `Source`

```ts
type Source = 'discovery' | 'iac';
```

`source` stays on each rule-level finding group. There is no top-level `source` field on `ScanResult`.

## `Severity`

```ts
type Severity = 'high' | 'medium' | 'low';
```

Every rule and finding group has a severity. `high` identifies the largest or most immediate cost risks, `medium`
identifies meaningful optimization opportunities, and `low` identifies cost hygiene and smaller accumulation risks.

## `SourceLocation`

```ts
type SourceLocation = {
  path: string;
  line: number;
  column: number;
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
  severity: Severity;
  source: Source;
  message: string;
  findings: FindingMatch[];
};
```

This is the rule-level group returned by a rule evaluator. Empty groups are not returned; evaluators return `null` instead.

| Field      | Type             | Description                                                                                                 |
| ---------- | ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `ruleId`   | `string`         | Public CloudBurn rule identifier; see the [rule ID compatibility status](rule-ids.md#compatibility-status). |
| `service`  | `string`         | Service name such as `ebs` or `ec2`.                                                                        |
| `severity` | `Severity`       | Relative cost impact used for prioritization and CI thresholds.                                             |
| `source`   | `Source`         | Whether the matches came from live discovery or static IaC analysis.                                        |
| `message`  | `string`         | Generic rule-level policy text shared by every nested match.                                                |
| `findings` | `FindingMatch[]` | Nested resource-level matches for the rule.                                                                 |

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
  diagnostics?: ScanDiagnostic[];
  evaluations?: ScanEvaluations;
  policy?: ScanPolicyResult;
  providers: ProviderFindingGroup[];
  suppressed?: SuppressedFinding[];
};
```

`evaluations` is opt-in for live discovery through `includeEvaluationResources`. It records the primary input resource
set supplied to completed rules, including rules that returned no findings. Shared sets are emitted once:

```ts
type ScanEvaluations = {
  resourceSets: EvaluationResourceSet[];
  rules: RuleEvaluation[];
};

type EvaluationResourceSet = {
  id: string;
  resources: EvaluatedResource[];
};

type EvaluatedResource = Omit<FindingMatch, 'region'> & {
  region: string; // `global` for account-scoped or global resources
  resourceType: string;
  arn?: string;
  name?: string;
  tags?: Record<string, string>;
  createdAt?: string;
  lastActivityAt?: string;
};

type RuleEvaluation = {
  description: string;
  findingCount: number;
  message: string;
  name: string;
  provider: CloudProvider;
  resourceSetId?: string;
  ruleId: string;
  service: string;
  serviceName: string;
  severity: Severity;
  source: 'discovery';
  status: 'triggered' | 'passed' | 'not_applicable';
  supports: Source[];
  reason?: string;
};
```

Every selected discovery rule appears exactly once when evaluation evidence is requested:

- `triggered` means the rule emitted one or more findings.
- `passed` means evaluation completed without findings; `resources` contains the compliant resources inspected.
- `not_applicable` means a required dataset was unavailable; `reason` retains the corresponding diagnostic message and
  no resource set is referenced.

AWS dataset definitions own evaluated-resource projection. Rule-specific projection overrides belong beside that
registry, not in host applications. For example, inactive CloudWatch log groups expose the newer latest-event or
latest-ingestion timestamp as `lastActivityAt`, while missing-retention checks expose no activity timestamp.

The SDK deliberately stops at this generic boundary. Consumers choose rule IDs for their products and own any product
schema, remediation effort, structured commands, grouping, persistence guards, and rendering.

`policy` is present when the effective mode config includes `failOn`. It makes SDK policy behavior observable without
changing the host process exit code:

```ts
type ScanPolicyResult = {
  qualifyingFindingCount: number;
  threshold?: Severity;
  violated: boolean;
};
```

The package-root `evaluateScanPolicy(result, threshold?)` helper evaluates another threshold against any `ScanResult`.
An omitted threshold evaluates an any-finding policy.

`suppressed` is present only when an IaC directive matched a finding. Each entry retains the original resource-level
`finding`, rule metadata, and the parsed suppression directive (including an optional reason) for auditability. These
entries are excluded from `providers` and do not count toward CLI policy gates.

```ts
type IaCSuppression =
  | { kind: 'rule'; ruleId: string; reason?: string; location: SourceLocation }
  | { kind: 'all'; reason?: string; location: SourceLocation };

type SuppressedFinding = {
  finding: FindingMatch;
  message: string;
  provider: CloudProvider;
  ruleId: string;
  service: string;
  severity: Severity;
  source: 'iac';
  suppression: IaCSuppression;
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
          "severity": "medium",
          "source": "iac",
          "message": "EBS volumes should use current-generation storage.",
          "findings": [
            {
              "resourceId": "aws_ebs_volume.gp2_data",
              "location": {
                "path": "main.tf",
                "line": 4,
                "column": 3
              }
            }
          ]
        }
      ]
    }
  ]
}
```

When inline suppressions match, the result can also contain:

```json
{
  "suppressed": [
    {
      "finding": {
        "resourceId": "aws_ebs_volume.legacy",
        "location": { "path": "main.tf", "line": 4, "column": 3 }
      },
      "message": "EBS volumes should use current-generation storage.",
      "provider": "aws",
      "ruleId": "CLDBRN-AWS-EBS-1",
      "service": "ebs",
      "severity": "medium",
      "source": "iac",
      "suppression": {
        "kind": "rule",
        "ruleId": "CLDBRN-AWS-EBS-1",
        "reason": "migration scheduled",
        "location": { "path": "main.tf", "line": 1, "column": 1 }
      }
    }
  ]
}
```
