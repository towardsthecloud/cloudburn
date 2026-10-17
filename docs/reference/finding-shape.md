# Finding Shape Reference

Public contracts: [rule metadata and finding types](../../packages/rules/src/shared/metadata.ts) and
[SDK scan result types](../../packages/sdk/src/types.ts). This reference is manually maintained alongside those sources.
The [scan result reference](scan-result.md) owns `ScanResult`, capability outcomes, and discovery progress events.

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

| Field | Type | Description |
| --- | --- | --- |
| `resourceId` | `string` | Provider-specific resource identity. Terraform uses resource addresses today; future CloudFormation support can use logical IDs or paths in the same field. |
| `resourceType` | `string?` | Provider resource namespace when an ID is not globally unique across the findings being compared. |
| `accountId` | `string?` | Account identifier when available. Omit it when unavailable. |
| `region` | `string?` | Region when available. Omit it when unavailable. |
| `actionType` | `string?` | Provider-normalized action such as `Delete`, `Upgrade`, `Rightsize`, `PurchaseReservedInstances`, `PurchaseSavingsPlans`, or `MigrateToGraviton`. |
| `location` | `SourceLocation` | Source coordinates for IaC matches when available. |
| `recommendation` | `FindingRecommendation?` | Provenance and identity metadata for matches that carry a native or external recommendation. |
| `impact` | `FindingImpact?` | Source-tagged financial impact for the match when the evidence system reports it. Absent when no financial evidence exists. |

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

| Field | Type | Description |
| --- | --- | --- |
| `source` | `string` | System that produced the evidence: `cloudburn` for native rule evaluation or `aws-cost-optimization-hub`. |
| `sourceDetail` | `string?` | Source subsystem when known, such as `ComputeOptimizer` or `CostExplorer` for Hub recommendations. |
| `sourceId` | `string?` | Opaque source-side identifier, for example a Hub `recommendationId`. Never used to invent resource identity. |
| `observedAt` | `string?` | When the source observed or collected the evidence. Omitted unless the source reports a real timestamp. |
| `refreshedAt` | `string?` | When the source refreshed its report, for example Hub `lastRefreshTimestamp`. Omitted unless the source reports it. |
| `resourceKey` | `string?` | Opaque versioned key identifying the scoped resource independently of action. |
| `opportunityId` | `string?` | Opaque versioned key identifying the resource plus action opportunity. |

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

| Field | Type | Description |
| --- | --- | --- |
| `currentCost` | `FinancialEvidence` | What the recommended scope currently costs, when the source reports it. |
| `potentialSavings` | `FinancialEvidence` | What the recommended action could save, when the source reports it. |
| `window` | `ImpactWindow?` | Source-reported observation window for the figures. |

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

| Hub rule | Declared overlap | Direction |
| --- | --- | --- |
| `CLDBRN-AWS-COSTOPTIMIZATIONHUB-2` Reservations | `CLDBRN-AWS-RDS-3`, `CLDBRN-AWS-REDSHIFT-2`, `CLDBRN-AWS-ELASTICACHE-1` reserved-coverage rules | Native over Hub |
| `CLDBRN-AWS-COSTOPTIMIZATIONHUB-3` Idle | `CLDBRN-AWS-EBS-2` unattached volumes (same `Delete` action only) | Native over Hub |
| `CLDBRN-AWS-COSTOPTIMIZATIONHUB-4` Rightsizing | `CLDBRN-AWS-LAMBDA-4` memory overprovisioning | Native over Hub |
| `CLDBRN-AWS-COSTOPTIMIZATIONHUB-5` Upgrades | `CLDBRN-AWS-EBS-1`, `CLDBRN-AWS-RDS-11` current-generation storage | Native over Hub |
| `CLDBRN-AWS-COSTOPTIMIZATIONHUB-6` Graviton | `CLDBRN-AWS-EC2-6`, `CLDBRN-AWS-RDS-4` Graviton reviews | Hub over native |

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

| Field | Type | Description |
| --- | --- | --- |
| `ruleId` | `string` | Public CloudBurn rule identifier; see the [rule ID compatibility status](rule-ids.md#compatibility-status). |
| `service` | `string` | Service name such as `ebs` or `ec2`. |
| `severity` | `Severity` | Relative cost impact used for prioritization and CI thresholds. |
| `source` | `Source` | Whether the matches came from live discovery or static IaC analysis. |
| `message` | `string` | Generic rule-level policy text shared by every nested match. |
| `findings` | `FindingMatch[]` | Nested resource-level matches for the rule. |

## `ProviderFindingGroup`

```ts
type ProviderFindingGroup = {
  provider: 'aws' | 'azure' | 'gcp';
  rules: Finding[];
};
```

This is the provider-level group returned by the SDK scan engines.
