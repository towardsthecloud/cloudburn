# @cloudburn/sdk

The CloudBurn SDK lets you run the same cost policy engine inside your own codebase. It handles config loading, Terraform and CloudFormation parsing, live AWS discovery, and rule evaluation.

Use it when you want CloudBurn in internal tooling, custom automations, or your own platform instead of calling the CLI.

## Installation

```bash
npm install @cloudburn/sdk
```

## Getting Started

### Static scans

Use `scanStatic()` to run the built-in rules against Terraform or CloudFormation.

```ts
import { CloudBurnClient } from '@cloudburn/sdk';

const client = new CloudBurnClient();
const result = await client.scanStatic('./iac');

for (const providerGroup of result.providers) {
  for (const ruleGroup of providerGroup.rules) {
    console.log(
      providerGroup.provider,
      ruleGroup.ruleId,
      ruleGroup.severity,
      ruleGroup.source,
      ruleGroup.findings.length,
    );
  }
}
```

Static scans recognize resource-local `cloudburn-ignore <rule-id> [reason]` and `cloudburn-ignore-all [reason]`
comments in Terraform and CloudFormation YAML. Matches removed by these directives are retained in
`result.suppressed`; active findings remain in `result.providers`.

Both modes accept a `failOn` threshold. When configured, the SDK evaluates it and exposes the effective threshold,
qualifying finding count, and violation status on `result.policy`:

```ts
const result = await client.scanStatic('./iac', {
  iac: { failOn: 'high' },
});

if (result.policy?.violated) {
  console.error(`${result.policy.qualifyingFindingCount} high-severity findings`);
}
```

Use the exported `evaluateScanPolicy(result, threshold?)` helper to apply a runtime threshold or an any-finding policy
without rerunning the scan. SDK policy evaluation reports state; it does not change the host process exit code.

### Live discovery

Use `initializeDiscovery()` first to set up AWS Resource Explorer. CloudBurn uses it as the live service catalog before it runs discovery rules.

```ts
import { CloudBurnClient } from '@cloudburn/sdk';

const client = new CloudBurnClient();

await client.initializeDiscovery();

const currentRegion = await client.discover();
const explicitRegion = await client.discover({
  target: { mode: 'regions', regions: ['eu-central-1'] },
});
const multipleRegions = await client.discover({
  target: { mode: 'regions', regions: ['eu-central-1', 'us-east-1'] },
});
const auditableResult = await client.discover({
  includeEvaluationResources: true,
  config: {
    discovery: {
      enabledRules: ['CLDBRN-AWS-CLOUDWATCH-1', 'CLDBRN-AWS-CLOUDWATCH-2'],
    },
  },
});
```

`discover()` defaults to the current AWS region and the AWS Core preset. You can also target one or more explicit AWS regions with `{ target: { mode: 'regions', regions: [...] } }`. Multi-region discovery requires an AWS Resource Explorer aggregator index. Rules that need explicit AWS setup are opt-in through `config.discovery.enabledRules`. `CLDBRN-AWS-TAGGING-1` needs an accessible aggregator, `CLDBRN-AWS-LAMBDA-4` needs AWS Compute Optimizer enrollment, and `CLDBRN-AWS-COSTOPTIMIZATIONHUB-1` needs AWS Cost Optimization Hub enrollment.

Set `includeEvaluationResources` when a caller needs audit evidence for checks that did not produce findings. The
optional `result.evaluations` value contains normalized identities from the primary resource dataset supplied to each
completed live rule. Shared resource sets are emitted once and referenced by rule entries. Every selected rule is
represented as `triggered`, `passed`, or `not_applicable`; skipped rules include the reason reported by discovery.
Rule entries also carry generic rule and service metadata so callers can select checks and build their own product
views without re-querying AWS or maintaining a second copy of rule descriptions.

Evaluation resources can include provider-normalized `data` when a check needs auditable evidence beyond identity and
timestamps. For example, `CLDBRN-AWS-CONFIG-1` reports the affected resource type, current recording frequency,
observation window, configuration-item volume, current and recently deleted resource counts, estimated monthly
reduction, turnover-estimate reliability, recorder scope and overrides, public continuous and daily unit prices, and any
Firewall Manager or paid service-linked recorder dependency. If bounded turnover inspection cannot decide an otherwise
eligible above-threshold review, discovery emits a diagnostic and reports the rule as `not_applicable` instead of
`passed`.

`CLDBRN-AWS-KMS-1` reports a regional count of enabled customer-managed keys, the previous-full-month creation count,
the UTC window boundaries, estimated monthly storage cost, repeated alias-pattern hashes, multi-Region and rotation
counts, key-metadata completeness, and usage-evidence coverage. The SDK never returns raw aliases in this dataset.
Denied `DescribeKey` calls leave a confirmed minimum count plus an explicit unreadable count.

`CLDBRN-AWS-KMS-2` reuses the same KMS review scan and reports individual keys that are at least 90 days old with no
recorded KMS cryptographic use during a complete 90-day tracking window. This covers never-used keys and keys whose
last recorded use is at least 90 days old. The evidence includes the key ARN, creation date, tracking start, last use
when present, multi-Region status, and an estimated monthly storage cost with its completeness flag. A shorter tracking
window is skipped. Missing key or usage metadata makes this check `not_applicable` instead of `passed`. Because KMS
cannot observe every possible use, the rule recommends disabling and monitoring a candidate before deletion. The
shared loader requires `kms:DescribeKey`, `kms:GetKeyLastUsage`, `kms:ListAliases`, and `kms:ListKeyRotations`.

`CLDBRN-AWS-EC2-14` checks available Transit Gateway VPC attachments over the previous 30 complete UTC days. A finding
requires complete attachment-level `BytesIn` and `BytesOut` coverage with both totals equal to zero. Evaluation evidence
includes the attachment, Transit Gateway, and VPC identities; Region; observed traffic; lookback length; and the public
regional hourly and estimated monthly attachment price when AWS publishes it. Missing pricing does not block the rule,
and attachments with incomplete CloudWatch evidence are skipped. The loader requires
`ec2:DescribeTransitGatewayAttachments`, `ec2:DescribeTransitGatewayVpcAttachments`, and
`cloudwatch:GetMetricData`.

`CLDBRN-AWS-COSTOPTIMIZATIONHUB-1` reads account-scoped Compute, EC2 Instance, and SageMaker Savings Plans purchase
recommendations from AWS Cost Optimization Hub. Evaluation evidence includes the Savings Plans type, account scope,
hourly commitment, estimated monthly cost and savings, savings percentage, currency, commitment term, payment option,
refresh time, recommendation source, and operational impact fields. EC2 Instance recommendations also retain the
instance family and commitment Region. The SDK checks enrollment but never changes it. An account that is not enrolled, lacks
`cost-optimization-hub:ListEnrollmentStatuses`, `cost-optimization-hub:ListRecommendations`, or
`cost-optimization-hub:GetRecommendation`, or returns incomplete purchase evidence reports the rule as
`not_applicable` instead of `passed`.

`CLDBRN-AWS-COSTOPTIMIZATIONHUB-6` is an opt-in Graviton migration rule for standalone EC2 instances, EC2 Auto Scaling
groups (single or mixed instance types), and RDS DB instances. Enable it through `config.discovery.enabledRules`.
It uses the shared Hub loader with `MigrateToGraviton`; rightsizing and generation upgrades remain separate actions.

The loader requires `cost-optimization-hub:ListEnrollmentStatuses`, `cost-optimization-hub:ListRecommendations`, and
`cost-optimization-hub:GetRecommendation`. It checks enrollment without changing it and queries the account through
the `us-east-1` Hub endpoint. Recommendations retain their own resource regions.

With `includeEvaluationResources: true`, `AwsCostOptimizationHubGravitonRecommendation` includes current and recommended
typed configurations, resource ID and ARN, account and region, current monthly cost, savings and percentage, currency,
implementation effort, restart and rollback flags, recommendation ID, source, and refresh timestamp.
`workloadCompatibility` follows [AWS's documented strategy mapping](https://docs.aws.amazon.com/cost-management/latest/userguide/coh-optimization-strategies.html):
EC2 and Auto Scaling `High` means `inferred_compatible`, while `VeryHigh` means `unclassified`. RDS `Medium` maps to
`not_applicable` because that strategy does not classify an inferred application workload. An inference still requires
application validation before migration; unclassified workloads have no confirmed compatibility.

Missing configuration, unsupported effort, incomplete evidence, unenrolled accounts, and denied access produce a
diagnostic and `not_applicable` evaluation. An enrolled account with no matching recommendations passes.
The native EC2 and RDS Graviton rules currently use family heuristics, which do not provide stronger workload
compatibility evidence, so their findings do not suppress this rule. Suppression requires an enabled native rule
reporting the same resource with stronger compatibility evidence.

`CLDBRN-AWS-COSTOPTIMIZATIONHUB-2` uses the same read-only enrollment, paginated recommendation, and bounded detail
loading seam for EC2, RDS, OpenSearch, Redshift, ElastiCache, MemoryDB, and DynamoDB reservation purchases. Its
evaluation evidence preserves account and Region, resource ID and ARN when AWS provides them, current monthly cost,
estimated savings and percentage, currency, implementation effort, restart and rollback flags, source, refresh time,
term, payment option, and the resource-type-specific purchase configuration. Duplicate recommendation IDs are loaded
once. A Hub finding is suppressed only when an enabled native CloudBurn rule actually reports the same resource
namespace and identity for the same reservation purchase action with direct service evidence. The presence of a native
rule in the catalog is not enough. This precedence is declared by rule metadata rather than AWS-specific engine policy, and evaluation evidence
retains the Hub rule's original triggered result. Unenrolled, denied, and incomplete responses make the Hub rule
`not_applicable`.

Enable `CLDBRN-AWS-COSTOPTIMIZATIONHUB-4` through `config.discovery.enabledRules` to read Hub rightsizing
recommendations for standalone EC2 instances, EC2 Auto Scaling groups, EBS volumes, Lambda functions, ECS services,
RDS DB instances, RDS DB instance storage, and Aurora DB cluster storage. It queries the current account through the
Hub endpoint in `us-east-1`, across all recommendation Regions, without requiring Resource Explorer.

The rule uses `cost-optimization-hub:ListEnrollmentStatuses`, `cost-optimization-hub:ListRecommendations`, and
`cost-optimization-hub:GetRecommendation`, plus `sts:GetCallerIdentity` for account identity. Grant the Hub actions on
`Resource: "*"`, as required by the [Hub IAM reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cost-optimization-hub.html). CloudBurn only reads enrollment; an administrator must enroll the account separately.

With `includeEvaluationResources: true`, the `aws-cost-optimization-hub-rightsizing-recommendations` resource set
exposes `AwsCostOptimizationHubRightsizingRecommendation`. Narrow its `resourceType` discriminant to read the typed
`currentConfiguration` and `recommendedConfiguration`; nested instance, mixed-instance, compute, and storage fields
remain structured. Evidence retains resource identity, account, Region, currency, current monthly cost, estimated
savings and percentage, implementation effort, restart and rollback flags, source, and refresh timestamp.
Regional identity is required: a valid account-matching ARN supplies a missing Region; otherwise the evidence is
incomplete. Lambda finding identity strips version and alias qualifiers to match the native rule, while evidence
retains the original ARN. The existing purchase-recommendation action union remains unchanged.

Only the AWS `Rightsize` action qualifies. Generation upgrades and Graviton migrations are separate actions.
`CLDBRN-AWS-LAMBDA-4`, when enabled and reporting the same Lambda ARN, account, and Region, suppresses the Hub
duplicate using direct Compute Optimizer memory evidence. Low-utilization and migration findings do not suppress it.
RDS instance and storage recommendations have separate evidence namespaces. Unenrolled accounts, denied access, and
incomplete detail evidence produce diagnostics and `not_applicable`; an enrolled account with no recommendations passes.

Enable idle capacity recommendations with `config.discovery.enabledRules: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-3']`.
The rule shares Hub enrollment, pagination, deduplication, and diagnostics with the purchase rules. It requires the
same three Hub read permissions and `sts:GetCallerIdentity`; all Hub queries use `us-east-1` and filter to the caller's account.
Idle recommendations also filter to the discovery target's Regions. An all-region target leaves that filter unset.

With `includeEvaluationResources: true`, `AwsCostOptimizationHubIdleRecommendation` retains exact actions,
typed current and recommended configurations, costs, savings, identity, and operational impact. Stop covers EC2
and RDS MySQL/PostgreSQL; Delete covers EBS, ECS, and Aurora MySQL/PostgreSQL instances; ScaleIn covers Auto Scaling
groups. AWS classifies RDS engine eligibility; Hub configuration exposes instance class, not engine metadata.
See [AWS's action mapping](https://docs.aws.amazon.com/cost-management/latest/userguide/coh-optimization-strategies.html).

An absent Stop/Delete target is represented as null. Missing ScaleIn targets, malformed supplied configuration,
missing operational flags, denied requests, or unenrolled accounts make the rule `not_applicable`. CloudBurn never
executes these actions or changes enrollment. The native unattached-volume rule can suppress the same EBS Delete
finding when enabled; low utilization alone does not suppress Stop/Delete recommendations.

`CLDBRN-AWS-COSTOPTIMIZATIONHUB-5` is opt-in through `config.discovery.enabledRules`. It reads only `Upgrade`
recommendations for EC2 instances, Auto Scaling groups, EBS volumes, RDS DB instances, and RDS DB instance storage
through the shared Hub loader in `us-east-1`. The three Hub IAM actions listed above require `Resource: "*"`;
account identity also uses `sts:GetCallerIdentity`. CloudBurn never changes enrollment or resources.

`AwsCostOptimizationHubUpgradeRecommendation` is a discriminated union keyed by `resourceType`, with typed
`currentConfiguration` and `recommendedConfiguration`. It retains identity, account, Region, cost, savings,
currency, implementation effort, restart, rollback, source, and refresh evidence. Missing required configuration,
identity, cost, or operational data makes evaluation `not_applicable`; an enrolled account with a successful empty
response passes. The [finding reference](../../docs/reference/finding-shape.md) lists each configuration contract.

Enabled native EBS and RDS storage generation rules take precedence for the same account, Region, resource, and
storage upgrade. RDS compute and storage findings use distinct namespaces. EC2 family preferences do not establish
the same recommended upgrade and do not suppress Hub findings. Evaluation evidence retains the original Hub result.

`CLDBRN-AWS-SAGEMAKER-3` reads SageMaker Savings Plans coverage from Cost Explorer for the last 30 complete days. It
flags coverage below 80 percent only when uncovered On-Demand cost is at least 72 cost units. When Cost Optimization
Hub returns a SageMaker purchase recommendation, that stronger finding suppresses the coverage warning for the account.
Cost Optimization Hub is an optional dependency for this rule, so missing enrollment or access does not block coverage
evaluation. Missing `ce:GetSavingsPlansCoverage` access, incomplete coverage values, or a Cost Explorer
`DataUnavailableException` make the rule `not_applicable`.

The SDK does not define product profiles, remediation effort, commands, or persistence schemas. Applications select
the discovery rules that fit their use case through `config.discovery.enabledRules` and transform the generic result
at their own product boundary.

### Lower-level helpers

If you need more control, the SDK also exposes a lower-level parser:

- `parseIaC(path)` as a standalone export when you want normalized Terraform and CloudFormation resources without running rules

The `CloudBurnClient` also exposes helper methods:

- `client.loadConfig(path?)` to resolve CloudBurn config from disk
- `client.getDiscoveryStatus()` to inspect AWS Resource Explorer readiness
- `client.listSupportedDiscoveryResourceTypes()` to inspect the AWS resource types discovery can search

## Docs

- Full docs: [cloudburn.io/docs](https://cloudburn.io/docs)
- Architecture overview: [docs/ARCHITECTURE.md](https://github.com/towardsthecloud/cloudburn/blob/main/docs/ARCHITECTURE.md)
- Rule reference: [docs/reference/rule-ids.md](https://github.com/towardsthecloud/cloudburn/blob/main/docs/reference/rule-ids.md)

## License

Apache-2.0
