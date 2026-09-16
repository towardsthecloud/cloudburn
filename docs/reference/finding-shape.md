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
  recommendation?: FindingRecommendation;
  impact?: FindingImpact;
};
```

| Field            | Type                     | Description                                                                                                                                                 |
| ---------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resourceId`     | `string`                 | Provider-specific resource identity. Terraform uses resource addresses today; future CloudFormation support can use logical IDs or paths in the same field. |
| `resourceType`   | `string?`                | Provider resource namespace when an ID is not globally unique across the findings being compared.                                                           |
| `accountId`      | `string?`                | Account identifier when available. Omit it when unavailable.                                                                                                |
| `region`         | `string?`                | Region when available. Omit it when unavailable.                                                                                                            |
| `actionType`     | `string?`                | Provider-normalized action such as `Delete`, `Upgrade`, `Rightsize`, `PurchaseReservedInstances`, `PurchaseSavingsPlans`, or `MigrateToGraviton`.           |
| `location`       | `SourceLocation`         | Source coordinates for IaC matches when available.                                                                                                          |
| `recommendation` | `FindingRecommendation?` | Provenance and identity metadata for matches that carry a native or external recommendation.                                                                |
| `impact`         | `FindingImpact?`         | Source-tagged financial impact for the match when the evidence system reports it. Absent when no financial evidence exists.                                 |

## FindingRecommendation

```ts
type EvidenceProvenance = {
  source: string;
  sourceDetail?: string;
  sourceId?: string;
  observedAt?: string;
  refreshedAt?: string;
};

type RecommendationIdentity = {
  resourceKey: string;
  opportunityId: string;
};

type FindingRecommendation = EvidenceProvenance & Partial<RecommendationIdentity>;
```

| Field           | Type      | Description                                                                                                         |
| --------------- | --------- | ------------------------------------------------------------------------------------------------------------------- |
| `source`        | `string`  | System that produced the evidence: `cloudburn` for native rule evaluation or `aws-cost-optimization-hub`.           |
| `sourceDetail`  | `string?` | Source subsystem when known, such as `ComputeOptimizer` or `CostExplorer` for Hub recommendations.                  |
| `sourceId`      | `string?` | Opaque source-side identifier, for example a Hub `recommendationId`. Never used to invent resource identity.        |
| `observedAt`    | `string?` | When the source observed or collected the evidence. Omitted unless the source reports a real timestamp.             |
| `refreshedAt`   | `string?` | When the source refreshed its report, for example Hub `lastRefreshTimestamp`. Omitted unless the source reports it. |
| `resourceKey`   | `string?` | Opaque versioned key identifying the scoped resource independently of action.                                       |
| `opportunityId` | `string?` | Opaque versioned key identifying the resource plus action opportunity.                                              |

`recommendation.source` describes who produced the evidence; `sourceDetail` narrows it to the underlying AWS signal.
This is separate from the rule group's `source` field (`discovery` or `iac`), which records which scan mode produced
the finding.

Timestamps are source-reported only. `refreshedAt` is the Hub `lastRefreshTimestamp`; `observedAt` is the source's own
observation or collection time. Neither field is ever populated from evaluation time, wall clock, or cache access, so
absence means unknown rather than "as old as the scan".
Freshness comparisons require an explicit `Z` or numeric timezone offset; timezone-less values are treated as unknown
rather than interpreted in the host timezone.

`resourceKey` and `opportunityId` are opaque JSON strings scoped by provider, account, Region, resource type, canonical
resource ID, and (for `opportunityId`) action. Recognized AWS ARNs are canonicalized to the service-local identifier so
an ARN and a plain ID produce the same key, except ECS container-instance and EKS nodegroup ARNs, which stay verbatim
so their cluster and path scope is never collapsed into another cluster's resource. Unrecognized or
mismatched-service ARNs are used verbatim, while an ARN whose embedded account or Region conflicts with the finding's
explicit scope produces no identity at all. Keys are versioned and
valid only for comparing matches within or across rules in one scan's inputs; they carry no promise of stability
across scan history. When the scope is incomplete (missing account, Region, resource type, ID, or action), both keys
are absent and the match cannot participate in identity-based deduplication or precedence; it is retained
conservatively instead of being collapsed into unrelated matches. A `recommendation` may carry provenance without
identity keys; that absence is deliberate, and the SDK never reconstructs identity from display fields or from a
source recommendation ID used as the display `resourceId` — such matches skip precedence entirely.
ECS service opportunities require a cluster-qualified identifier (`cluster/service`); when a service ARN is supplied
it takes precedence over a bare display name, and a name without cluster scope carries provenance only.
When both a resource ID and ARN are supplied, their canonical resource components must also agree; contradictory
evidence retains provenance without identity. ECS service-name qualification and Lambda version unqualification are
recognized equivalences. Lambda version and alias qualifiers are removed for both evidence comparison and
function-level identity keys. A legacy unscoped ECS service ARN does not replace a supplied cluster-qualified ID;
contradictory evidence never replaces the displayed resource ID. Malformed ARNs cannot establish identity.
Recognized regional AWS resources require both Region and account components in the ARN; valid global ARN formats
remain supported. Reservation summary and purchase-configuration Regions must agree when both are supplied.

## FindingImpact

```ts
type ImpactPeriod = 'hour' | 'day' | 'month' | 'year';
type ImpactWindow = { start?: string; end?: string; lookbackDays?: number };
type ImpactUnknownReason = { code: string; message: string };

type FinancialEvidence =
  | { confidence: 'exact' | 'estimated'; amount: number; currency: string; period: ImpactPeriod }
  | { confidence: 'unknown'; amount?: never; currency?: string; period?: ImpactPeriod; reason: ImpactUnknownReason };

type FindingImpact = EvidenceProvenance & {
  currentCost: FinancialEvidence;
  potentialSavings: FinancialEvidence;
  window?: ImpactWindow;
};
```

| Field              | Type                | Description                                                             |
| ------------------ | ------------------- | ----------------------------------------------------------------------- |
| `currentCost`      | `FinancialEvidence` | What the recommended scope currently costs, when the source reports it. |
| `potentialSavings` | `FinancialEvidence` | What the recommended action could save, when the source reports it.     |
| `window`           | `ImpactWindow?`     | Source-reported observation window for the figures.                     |

`currentCost` and `potentialSavings` are independent per-metric measurements: each carries its own `confidence`, and
one can be known while the other is unknown. `confidence: 'exact'` is reserved for measured or billed evidence;
`'estimated'` marks a modeled projection. Both built-in integrations are modeled — Hub recommendations are AWS
estimates and the AWS Config recording-frequency projection reuses the dataset's modeled savings — so neither emits
`exact`.

An `unknown` evidence value has **no `amount` property at all**: a missing or unusable source figure is absent, never
substituted with zero. A known `amount: 0` is a real measurement and stays distinct from unknown. The `reason.code`
explains why the amount is absent, and any valid supplied `currency`/`period` is preserved for context. On the Hub
dataset the financial fields (`currencyCode`, `estimatedMonthlyCost`, `estimatedMonthlySavings`,
`estimatedSavingsPercentage`) are nullable, and both `recommendationLookbackPeriodInDays` (recommendation generation)
and `costCalculationLookbackPeriodInDays` (cost impact) are optional: absent money does not invalidate a
recommendation whose identity, refresh, source, and configuration evidence is complete — it surfaces as unknown
impact instead of a structural failure. Hub impact windows use only `costCalculationLookbackPeriodInDays` from
GetRecommendation, never the recommendation-generation horizon.

`impact` reuses `EvidenceProvenance` semantics: `source`, `sourceDetail`, `sourceId`, `observedAt`, and `refreshedAt`
are source-reported only and are never populated from evaluation time or inferred. `window.start`/`window.end` exist
only when the source reports real endpoints, and `window.lookbackDays` mirrors a source-reported positive lookback
duration. A lookback duration or a refresh timestamp is **not** a known measurement endpoint, so endpoints are never
inferred from them.

Two caveats for consumers:

- **No aggregation API.** Nothing sums, converts currencies or units, or normalizes amounts. Aggregation is only
  valid for the same metric (`currentCost` or `potentialSavings`) with the same currency, same period, compatible
  known windows and cost basis, and proven non-overlapping opportunities. Keep mixed `exact`/`estimated` confidence
  separate and labeled. Matches that share a resource but differ in action, or that mix account commitments (Savings
  Plans, reserved capacity) with resource-scoped actions, can compete for the same spend; a unique `opportunityId`
  distinguishes opportunities but is not proof that savings are additive. Missing or incomplete windows do not
  invalidate the source monthly estimates — they only block automatic comparable-window aggregation.
- **Cost basis differs per source.** A Hub purchase recommendation's `currentCost` is the eligible usage the
  commitment would cover, not the total account or resource bill. The native AWS Config recording-frequency rule
  reports only its modeled `potentialSavings`; `currentCost` is always unknown, and no timestamps are invented for it.
  A conditioned or dependency-blocked projection (for example a recorder whose continuous mode a dependent service
  requires) reports unknown savings rather than certifying actionable savings.

## Cross-rule precedence

Rules declare `supersedesRuleIds`, and the SDK applies precedence only between matches that share a complete computed
opportunity identity — the same provider, account, Region, canonical resource type and ID, **and action**. Suppression
is deterministic: the output does not depend on rule order or finding order, and tied candidates resolve by stable
lexical ordering so cycles and transitive chains cannot discard every finding. String tie-breakers use
locale-independent UTF-16 code-unit order; distinct source identifiers are never treated as equal by locale
collation.

For legacy or custom findings without a `recommendation` object, the engine computes that identity from the rule
provider and complete finding scope fields. A present `recommendation` object without `opportunityId` deliberately
marks unidentified evidence and skips precedence; the engine does not reconstruct its missing identity.

| Hub rule                                        | Declared overlap                                                                                | Direction       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------- |
| `CLDBRN-AWS-COSTOPTIMIZATIONHUB-2` Reservations | `CLDBRN-AWS-RDS-3`, `CLDBRN-AWS-REDSHIFT-2`, `CLDBRN-AWS-ELASTICACHE-1` reserved-coverage rules | Native over Hub |
| `CLDBRN-AWS-COSTOPTIMIZATIONHUB-3` Idle         | `CLDBRN-AWS-EBS-2` unattached volumes (same `Delete` action only)                               | Native over Hub |
| `CLDBRN-AWS-COSTOPTIMIZATIONHUB-4` Rightsizing  | `CLDBRN-AWS-LAMBDA-4` memory overprovisioning                                                   | Native over Hub |
| `CLDBRN-AWS-COSTOPTIMIZATIONHUB-5` Upgrades     | `CLDBRN-AWS-EBS-1`, `CLDBRN-AWS-RDS-11` current-generation storage                              | Native over Hub |
| `CLDBRN-AWS-COSTOPTIMIZATIONHUB-6` Graviton     | `CLDBRN-AWS-EC2-6`, `CLDBRN-AWS-RDS-4` Graviton reviews                                         | Hub over native |

`CLDBRN-AWS-COSTOPTIMIZATIONHUB-1` Savings Plans is not in this table: a SageMaker purchase recommendation suppresses
`CLDBRN-AWS-SAGEMAKER-3` inside that rule's evaluator through its optional Hub evidence. The suppression is
account-coverage scope, not `opportunityId` identity precedence.

Within one rule, duplicate matches for the same opportunity resolve by source-reported freshness — `refreshedAt`,
then `observedAt`, then source identifiers, then canonical content — so one representative survives deterministically.
That same-rule freshness ordering is separate from the cross-rule graph above, which applies only where
`supersedesRuleIds` declares it. Matches from rules that share an `opportunityId` without a declared edge are all
retained; consumers must treat them as non-additive rather than summing them.

A different action on the same resource is preserved as a separate opportunity: the two matches share a `resourceKey`
but have different `opportunityId` values, so they can compete for the same resource without suppressing each other.
Findings whose identities differ in provider, account, Region, or resource namespace never suppress each other even
when the underlying AWS resources overlap — ECS (`CLDBRN-AWS-ECS-*`) and EKS (`CLDBRN-AWS-EKS-*`) Graviton findings
remain distinct from EC2/RDS Hub findings and are not additive across the underlying fleets. Account-wide commitments
(Savings Plans, reserved capacity) can also overlap resource-scoped opportunities without sharing keys.

Matches without complete identity are never suppressed and never suppress others. Evaluation resource sets and
`findingCount` in `evaluations.rules` record pre-precedence evidence for audit; they are not totals of what remains in
`providers`, and the SDK does not produce an aggregate of overlapping opportunities.

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

| Kind      | Fields                                                                                                                      | Meaning                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `catalog` | `resourceCount`, `searchRegion`                                                                                             | The entire requested catalog finished.                                                    |
| `dataset` | `datasetKey`, `completedDatasets`, `totalDatasets`                                                                          | One requested dataset settled, including unavailable evidence. This is not a pass result. |
| `rule`    | `ruleId`, `status`, `findingCount`, `findings`, `reason?`, `provisional: true`, `completedRules`, `totalRules`, `elapsedMs` | Required and selected optional evidence settled and the rule was evaluated.               |

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
  capabilities?: AwsCapabilityOutcome[];
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

`capabilities` is populated on every final live `discover()` result — an empty array when no selected rule depends on
a gated capability — and is omitted by static scans. An absent capability was not assessed, which is not the same as
ready. See [`AwsCapabilityOutcome`](#awscapabilityoutcome) for the exact shape.

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
For example, `CLDBRN-AWS-CONFIG-1` includes the affected AWS resource type, current recording frequency, 14-day
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

Savings Plans finding resource types use `costoptimizationhub:savings-plans-recommendation:<savingsPlansType>`.
The purchase family remains part of provenance-based deduplication even when source IDs and account/Region match.

`CLDBRN-AWS-COSTOPTIMIZATIONHUB-1` projects one evaluated resource per Savings Plans purchase recommendation. Its
normalized `data` contains the recommendation ID and source, Savings Plans type, account scope, account and Region when
present, action type, current monthly cost, estimated monthly savings and percentage, currency, hourly commitment,
implementation effort when present, last refresh time, term, payment option, restart requirement, and rollback
availability. EC2 Instance recommendations also include instance family and commitment Region. Summary coalescing
uses the full source scope key, not recommendation ID alone; finding deduplication follows the scoped identity and
provenance rules above. Missing required purchase terms makes the rule `not_applicable`; missing financial values
remain valid as unknown impact.

`CLDBRN-AWS-COSTOPTIMIZATIONHUB-2` projects one evaluated resource per reservation purchase recommendation. Resource
identity prefers the AWS resource ID and retains its ARN when available, with the recommendation ID as the fallback.
Its normalized `data` contains the common account, Region, cost, savings, effort, restart, rollback, source, and refresh
fields plus a discriminated configuration for EC2 Reserved Instances, RDS Reserved Instances, OpenSearch Reserved
Instances, Redshift reserved nodes, ElastiCache reserved nodes, MemoryDB reserved instances, or DynamoDB reserved
capacity. The configuration retains the applicable term, payment option, commitment Region, purchase cost and quantity,
instance shape, platform, tenancy, engine, deployment, license, offering, size-flexibility, or capacity-unit fields that
AWS provides. Summary coalescing uses the full source scope key rather than recommendation ID alone. A Hub finding is
omitted only when an enabled native
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

Metric-dependent rules, the ECR lifecycle-content rules (`CLDBRN-AWS-ECR-2`, `CLDBRN-AWS-ECR-3`), the Compute
Optimizer memory rule (`CLDBRN-AWS-LAMBDA-4`), and the stopped-instance attachment rule (`CLDBRN-AWS-EBS-3`) add
`coverage` with separate `assessed` and `unknown` resource identities.
These arrays are specific to the rule: a Lambda function can have known error-rate evidence and unknown duration
evidence, and a repository whose lifecycle policy could not be parsed is unknown for both ECR content rules. Their lengths
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

## AwsCapabilityOutcome

```ts
type AwsCapabilityOutcome = {
  capability: AwsCapability;
  status: AwsCapabilityStatus;
  reasons: AwsCapabilityReason[];
  scope: AwsCapabilityScope;
  datasetKeys: DiscoveryDatasetKey[];
};
```

`AwsCapability` is the bounded catalog also exported as `AWS_CAPABILITIES`: `cost-optimization-hub-enrollment`,
`compute-optimizer-enrollment`, `resource-explorer-aggregator`, `cost-explorer-access`, and `budgets-access`.
`datasetKeys` lists the discovery datasets that contributed to the outcome, sorted and deduplicated.

```ts
type AwsCapabilityStatus = 'available' | 'partial' | 'unavailable' | 'error';

type AwsCapabilityReason =
  | 'not-enrolled'
  | 'aggregator-required'
  | 'region-not-enabled'
  | 'default-view-required'
  | 'filtered-view'
  | 'tags-view-required'
  | 'access-denied'
  | 'throttled'
  | 'service-error'
  | 'incomplete-evidence'
  | 'data-unavailable'
  | 'dataset-unavailable'
  | 'not-assessed';
```

| Status        | Meaning                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `available`   | Every mapped dataset the scan needed completed; a successful empty response still counts.                                       |
| `partial`     | At least one dataset loaded, but evidence has unknown coverage or another dataset or Region failed.                            |
| `unavailable` | No usable evidence: the capability is not enrolled, access was denied, required setup is missing, source data was incomplete or unavailable, or nothing applicable ran. |
| `error`       | No usable evidence and at least one observation ended in a throttled or unclassified service error.                            |

| Reason                  | Meaning                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `not-enrolled`          | The service requires account enrollment or an opt-in that is not active.             |
| `aggregator-required`   | Account-wide Resource Explorer queries need an accessible aggregator index.          |
| `region-not-enabled`    | Resource Explorer is not enabled in a required Region.                               |
| `default-view-required` | Resource Explorer needs a default view in the search Region.                         |
| `filtered-view`         | The resolved Resource Explorer view applies filters and cannot serve the query.      |
| `tags-view-required`    | The Resource Explorer view does not expose `tags` for tagging queries.               |
| `access-denied`         | AWS denied the request.                                                              |
| `throttled`             | AWS throttled the request.                                                           |
| `service-error`         | The dataset load ended in an unclassified service error.                             |
| `incomplete-evidence`   | Returned evidence was partial, carried unknown coverage, or missed selected Regions. |
| `data-unavailable`      | AWS accepted the request but the requested data is unavailable; not an access or enrollment failure. |
| `dataset-unavailable`   | The dataset was skipped for an unclassified reason.                                  |
| `not-assessed`          | A selected rule required the capability but zero catalog resources matched, so no service call ran. |

```ts
type AwsCapabilityScope =
  | { type: 'account' }
  | { type: 'all-regions' }
  | { type: 'regional'; regions: string[] }
  | { type: 'recommendation-source'; accountId: string; region?: string };
```

Regional scope applies to direct Compute Optimizer observations: `scope.regions` lists the Regions where the mapped
dataset actually observed catalog resources or failed. When nothing was observed — for `not-assessed` or fully
unavailable outcomes — the scope falls back to the requested scan scope: the requested Regions for a regional target,
or `all-regions` for an all-Region target. `all-regions` only means the scan targeted every enabled Region; it never
certifies that coverage exists. Account scope refers to the scanned account. No scope certifies full Region, index, or
upstream-source coverage.

A `recommendation-source` outcome records that returned Cost Optimization Hub rows carried a given upstream source —
`ComputeOptimizer` or `CostExplorer` — for that account and optional Region. It is bounded to the returned records and
does not certify current enrollment or full source coverage, so an empty Hub response produces no source outcome, and a
source outcome may coexist with a separate direct outcome for the same capability.

When a Resource Explorer catalog failure prevents a capability's dataset from running, its outcome reports
`unavailable` with `dataset-unavailable`. The original catalog failure remains in `ScanResult.diagnostics`; it does not
establish an enrollment or permission failure for the unassessed capability.

Regional Resource Explorer indexing and account-wide tagging are separate observations: a successful regional catalog
never implies aggregator access, and an `available` `resource-explorer-aggregator` outcome means only that the queried
aggregator view answered — not that every enabled Region or resource is indexed. `getDiscoveryStatus` remains the
separate Resource Explorer setup probe and is unaffected by these outcomes.

Reasons are classified from bounded diagnostic codes and statuses only — never from diagnostic text — and are
independent of rule evaluation statuses: an `available` capability means the datasets loaded, not that the rules
passed. A capability is absent from `capabilities` only when no selected rule requires it; absence means the scan never
assessed it. `getRuleCapabilities` maps rule IDs to required capabilities without a scan — see the
[SDK README](../../packages/sdk/README.md) for its unknown-rule behavior.
