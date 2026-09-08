# Finding and ScanResult Shape Reference

Public contracts: [rule metadata and finding types](../../packages/rules/src/shared/metadata.ts) and
[SDK scan result types](../../packages/sdk/src/types.ts). This reference is manually maintained alongside those sources.

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
  actionType?: string;
  resourceId: string;
  resourceType?: string;
  accountId?: string;
  region?: string;
  location?: SourceLocation;
};
```

| Field          | Type             | Description                                                                                                                                                 |
| -------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resourceId`   | `string`         | Provider-specific resource identity. Terraform uses resource addresses today; future CloudFormation support can use logical IDs or paths in the same field. |
| `resourceType` | `string?`        | Provider resource namespace when an ID is not globally unique across the findings being compared.                                                           |
| `accountId`    | `string?`        | Account identifier when available. Omit it when unavailable.                                                                                                |
| `region`       | `string?`        | Region when available. Omit it when unavailable.                                                                                                            |
| `location`     | `SourceLocation` | Source coordinates for IaC matches when available.                                                                                                          |

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

## AwsDiscoveryProgressEvent

`CloudBurnClient.discover({ onProgress })` accepts a synchronous callback. Its discriminated union now includes
`kind: 'rule'` alongside the existing `catalog` and `dataset` events. Consumers that switch exhaustively over `kind`
should handle this additive variant.

| Kind | Fields | Meaning |
| ---- | ------ | ------- |
| `catalog` | `resourceCount`, `searchRegion` | The entire requested catalog finished. |
| `dataset` | `datasetKey`, `completedDatasets`, `totalDatasets` | One requested dataset settled, including unavailable evidence. This is not a pass result. |
| `rule` | `ruleId`, `status`, `findingCount`, `findings`, `reason?`, `provisional: true`, `completedRules`, `totalRules`, `elapsedMs` | Required and selected optional evidence settled and the rule was evaluated. |

Rule `status` uses the same `triggered | passed | unknown | not_applicable` values as `RuleEvaluation`.
`findings` contains normalized `FindingMatch[]` before cross-rule precedence, and `findingCount` is its length.
Unavailable required datasets produce `not_applicable`; incomplete resource or regional coverage cannot become a
full pass. `elapsedMs` starts after rule selection and excludes public-call configuration and identity setup.

Rule events are optional, emitted at most once per selected rule, and ordered by evidence completion. They can precede
`catalog`. Counts report settled work, including skipped rules. All events are provisional feedback for an in-progress
scan: precedence or a later catalog failure can change the final output. The SDK re-evaluates the completed context
and applies precedence before resolving `ScanResult`, preserving deterministic final providers, rules, and findings.
The resolved promise is the final signal; there is no final-progress event. On cancellation, discard the provisional
state because the promise rejects without a successful partial result. Callback errors also reject discovery.

## `ScanResult`

```ts
type ScanResult = {
  diagnostics?: ScanDiagnostic[];
  evidence?: AwsEvidenceProvenance[];
  evaluations?: ScanEvaluations;
  policy?: ScanPolicyResult;
  providers: ProviderFindingGroup[];
  suppressed?: SuppressedFinding[];
};
```

`evidence` is present when live discovery cache controls are configured, including cache-off mode. It describes
catalog, dataset, and supporting pricing collection independently of findings: source, timestamps, actual observation
interval, completeness, and dataset coverage/diagnostics. See the [evidence cache reference](evidence-cache.md#result-provenance).

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
  data?: unknown; // Provider-normalized evidence used to evaluate the resource
  name?: string;
  tags?: Record<string, string>;
  createdAt?: string;
  lastActivityAt?: string;
};

type LiveEvaluationCoverage = {
  assessed: FindingMatch[];
  unknown: FindingMatch[];
};

type RuleEvaluation = {
  coverage?: LiveEvaluationCoverage;
  description: string;
  findingCount: number;
  message: string;
  name: string;
  provider: CloudProvider;
  resourceSetId?: string;
  ruleId: string;
  service: string;
  severity: Severity;
  source: 'discovery';
  status: 'triggered' | 'passed' | 'not_applicable' | 'unknown';
  supports: Source[];
  supersedesRuleIds?: string[];
  reason?: string;
};
```

`data` is present only when a discovery dataset has normalized evidence that does not fit the generic identity fields.
For example, `CLDBRN-AWS-CONFIG-1` includes the current recording frequency, affected AWS resource type, 14-day
configuration-item volume, recorded resource count, estimated monthly configuration-item reduction, public continuous
and daily unit prices, estimated monthly recording-cost reduction, recorder scope and overrides, and whether Firewall
Manager or a paid service-linked recorder requires continuous recording.

`CLDBRN-AWS-KMS-1` includes the enabled customer-managed key count, previous-full-month creation window and key count,
estimated monthly storage cost, repeated alias-pattern hashes, rotation and multi-Region counts, and usage-evidence
coverage. It also states whether every discovered key could be classified and counts keys whose `DescribeKey` metadata
was denied, so the confirmed key count is not mistaken for complete inventory. Raw aliases are never returned. Denied
usage or rotation metadata produces a diagnostic and marks the related evidence incomplete, while the rule remains
limited to proliferation and churn.

`CLDBRN-AWS-KMS-2` projects one evaluated resource per key from the shared KMS review scan. Its normalized `data`
contains the key ARN, creation date, multi-Region status, usage-evidence classification, estimated monthly storage cost,
whether that estimate includes complete rotation history, the tracking start, and the last recorded use when present.
Only keys with at least 90 days of complete no-recorded-usage evidence can trigger the rule. Missing key or usage
metadata makes the rule `not_applicable` rather than allowing incomplete evidence to look like a pass.

`CLDBRN-AWS-COSTOPTIMIZATIONHUB-1` projects one evaluated resource per Savings Plans purchase recommendation. Its
normalized `data` contains the recommendation ID and source, Savings Plans type, account scope, account and Region when
present, action type, current monthly cost, estimated monthly savings and percentage, currency, hourly commitment,
implementation effort when present, last refresh time, term, payment option, restart requirement, and rollback
availability. EC2 Instance recommendations also include instance family and commitment Region. Duplicate recommendation
IDs are evaluated once. Missing purchase terms or required cost evidence makes the rule `not_applicable`.

`CLDBRN-AWS-COSTOPTIMIZATIONHUB-2` projects one evaluated resource per reservation purchase recommendation. Resource
identity prefers the AWS resource ID and retains its ARN when available, with the recommendation ID as the fallback.
Its normalized `data` contains the common account, Region, cost, savings, effort, restart, rollback, source, and refresh
fields plus a discriminated configuration for EC2 Reserved Instances, RDS Reserved Instances, OpenSearch Reserved
Instances, Redshift reserved nodes, ElastiCache reserved nodes, MemoryDB reserved instances, or DynamoDB reserved
capacity. The configuration retains the applicable term, payment option, commitment Region, purchase cost and quantity,
instance shape, platform, tenancy, engine, deployment, license, offering, size-flexibility, or capacity-unit fields that
AWS provides. Duplicate recommendation IDs are evaluated once. A Hub finding is omitted only when an enabled native
rule emits a finding with the same account, Region, resource identity, and reservation purchase action. Unavailable or
incomplete recommendation evidence makes the rule `not_applicable`.

`CLDBRN-AWS-COSTOPTIMIZATIONHUB-5` projects `AwsCostOptimizationHubUpgradeRecommendation` in `data`. The
`resourceType` discriminator correlates `currentConfiguration` and `recommendedConfiguration`:

| Resource type          | Configuration fields                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Ec2Instance`          | `instance.type`                                                                                              |
| `Ec2AutoScalingGroup`  | `type`; single `instance.type` or nonempty `mixedInstances[].type`; optional `allocationStrategy`            |
| `EbsVolume`            | `storage.type`, `storage.sizeInGb`; optional `performance.iops`, `performance.throughput`, `attachmentState` |
| `RdsDbInstance`        | `instance.dbInstanceClass`                                                                                   |
| `RdsDbInstanceStorage` | `storageType`, `allocatedStorageInGb`; optional `iops`, `storageThroughput`                                  |

Each recommendation retains the AWS resource ID and ARN when present, account, Region, action `Upgrade`, currency,
estimated monthly cost and savings, savings percentage, implementation effort, restart and rollback flags, source,
and refresh timestamp. At least one resource identity and both configurations are required. Incomplete details make
the dataset unavailable and evaluation `not_applicable`, including when other recommendations are complete.

Finding identities normalize supported ARNs to service identifiers. Namespaces are `ec2:instance`,
`autoscaling:autoScalingGroup`, `ec2:volume`, `rds:db`, and `rds:db-storage`, respectively.
Native `CLDBRN-AWS-EBS-1` and `CLDBRN-AWS-RDS-11` discovery findings also carry the matching storage namespace
and declare precedence over `-5`. Only enabled native rules that emit the same account, Region, and resource match
can suppress a Hub finding; evaluation resources retain the Hub evidence before suppression.

`CLDBRN-AWS-SAGEMAKER-3` projects one account-scoped coverage record for the last 30 complete days. Its normalized
`data` contains the period, coverage percentage, uncovered public On-Demand cost, spend covered by Savings Plans, and
total eligible cost. It triggers below 80 percent coverage only when uncovered cost is at least 72 cost units. A
SageMaker purchase recommendation from Cost Optimization Hub suppresses the coverage warning. Cost Optimization Hub
is optional for this rule, so an unavailable recommendation dataset does not prevent coverage evaluation. Missing,
incomplete, denied, or otherwise unavailable Cost Explorer coverage evidence makes the rule `not_applicable`.

`CLDBRN-AWS-COSTOPTIMIZATIONHUB-3` preserves the exact `Stop`, `Delete`, or `ScaleIn` action in each finding.
Its `AwsCostOptimizationHubIdleRecommendation` evidence discriminates by `currentResourceType` and `actionType`,
with typed `currentConfiguration` and `recommendedConfiguration`. A null target means AWS omitted the target
configuration for Stop or Delete; ScaleIn requires a target configuration. Empty or malformed supplied configurations
make the dataset unavailable.

Evidence retains resource identity, account, Region, currency, current monthly cost, savings and percentage,
implementation effort, restart and rollback flags, source, and refresh time. Native EBS unattached-volume findings
take precedence only for the same namespace, canonical resource ID, account, Region, and Delete action.
RDS idle and EC2 low-utilization rules do not establish the same specific action and do not suppress these findings.

Every selected discovery rule appears exactly once when evaluation evidence is requested:

- `triggered` means the rule emitted one or more findings. It remains triggered when generic rule precedence omits an
  identical finding from `providers`, preserving the evaluator's original result for audit evidence.
- `passed` means evaluation completed without findings and without unresolved evidence reported by the rule.
- `unknown` means no finding was established, but required evidence was incomplete for some resources or Regions.
  `reason` describes the missing coverage. A resource set can still contain the known candidates.
- `not_applicable` means a required dataset was unavailable; `reason` retains the corresponding diagnostic message and
  no resource set is referenced.

Metric-dependent rules add `coverage` with separate `assessed` and `unknown` resource identities. These arrays are
specific to the rule: a Lambda function can have known error-rate evidence and unknown duration evidence. Their lengths
are the assessed and unknown resource counts. An assessed resource has enough evidence for the policy decision; it can
be compliant or have a finding. A `triggered` rule can still have unknown resources. Shared `resourceSets` describe
primary inputs and must not be interpreted as a list of fully assessed resources.

Whole-region dataset failures retain the existing skipped diagnostics and exclusion from resource sets. Such a rule
cannot report `passed`, even when no resource identity could be hydrated for an excluded Region. Complete required
dataset failures still use `not_applicable`.

Compatibility: `RuleEvaluation.status` adds `unknown`, and `coverage` is optional. Consumers validating status strings
must accept the new value and inspect coverage before treating a triggered result as fully assessed. Finding groups and
`evaluateLive(): Finding | null` retain their existing shapes. Config recording-frequency evidence now uses `null` for
unknown `configurationItemsRecorded`, `estimatedMonthlyConfigurationItemReduction`, and
`estimatedMonthlyRecordingCostReductionUsd`; callers must check these before calculations.

AWS dataset definitions own evaluated-resource projection. Rule-specific projection overrides belong beside that
registry, not in host applications. For example, inactive CloudWatch log groups expose the latest event timestamp as
`lastActivityAt`, while missing-retention checks expose no activity timestamp.

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
