# Cost Guardrails and Global Tagging Design

## Goal

Add two account-wide AWS cost-governance capabilities to CloudBurn discovery:

- report configured AWS Budgets whose actual spend exceeds their limit
- report every taggable AWS resource indexed by Resource Explorer that has no user-created tags

The implementation must preserve CloudBurn's dataset-driven rule architecture, avoid service-by-service tagging rules, and never report missing or inaccessible tag data as an untagged resource.

## Rules

### Exceeded AWS budgets

`CLDBRN-AWS-COSTGUARDRAILS-3` extends the existing `costguardrails` family. It depends on `aws-cost-guardrail-budgets` and emits a discovery finding for each normalized budget whose actual spend is strictly greater than its limit. Equal or lower spend is compliant.

Each match uses `budget/<budget-name>` as its resource ID and includes the AWS account ID without a region. The existing missing-budget rule continues to use `budgetCount` unchanged.

### Globally untagged resources

`CLDBRN-AWS-TAGGING-1` introduces a `tagging` rule family. It depends on `aws-resource-explorer-untagged-resources` and emits one grouped discovery finding containing every matching resource ARN, region, and account ID.

The dataset runs one paginated Resource Explorer `ListResources` query with:

```text
resourcetype.supports:tags tag:none
```

AWS defines `tag:none` as no user-created tags. AWS-managed tags do not satisfy the rule. Restricting the query to `resourcetype.supports:tags` avoids findings for resource types that cannot be tagged.

## Data Contracts

The existing budget summary gains normalized spend details while retaining `budgetCount` and `accountId`. A spend detail contains the budget name, actual spend, limit, common unit, and an optional normalized forecast. The public detail collection is optional for source compatibility, while the built-in hydrator always returns an array.

A new untagged-resource type contains:

```ts
type AwsUntaggedResource = {
  arn: string;
  service: string;
  resourceType: string;
  region: string;
  accountId: string;
};
```

The new `aws-resource-explorer-untagged-resources` dataset is discovery-only and account-wide. It does not add service SDK clients, per-service API calls, or static IaC datasets.

## Resource Explorer Integration

The SDK adds a reusable filtered `ListResources` helper that shares the existing Resource Explorer target resolution, view selection, pagination, retry, normalization, deduplication, and region/aggregator behavior. The tagging dataset calls this helper directly because the ordinary discovery catalog contains only resource types requested by other active rules and cannot provide global tagging coverage.

Resource Explorer permits `tag:none` only when the active view includes the optional `tags` property. `discover init` therefore ensures the default view includes `IncludedProperties: [{ Name: 'tags' }]` after setup verification and when an existing topology is reused. This setup step may call `UpdateView` and requires the corresponding Resource Explorer permission.

Ordinary discovery remains read-only. When the tagging dataset is active, it validates that the selected default view is unfiltered and includes `tags`. A missing property produces an actionable discovery error instructing the user to run `cloudburn discover init`; it never produces an empty dataset.

## Normalization and Failure Behavior

Budget details are emitted only when the budget name, actual spend, limit, and same non-empty unit are available and numeric. Malformed or unit-mismatched details remain included in `budgetCount` but are excluded from exceeded-budget evaluation. Forecast data is retained for future rules but does not affect this release.

Resource Explorer results missing required identity fields are skipped using the existing resource normalization behavior. Access denial, invalid view configuration, throttling exhaustion, and query failures use the existing contextual discovery error/diagnostic pipeline. No failure is converted into a zero-tag match or a clean account.

## Testing

Development follows vertical red-green slices at public seams:

1. Budget evaluator and budget hydrator normalization, pagination, malformed values, unit matching, and optional forecast handling.
2. Tagging evaluator behavior for matching resources and empty successful results.
3. Filtered Resource Explorer querying across pages, regions, aggregator targets, retries, deduplication, and malformed resources.
4. Default-view setup and validation for new, existing, compliant, and tag-invisible views.
5. Discovery registry/orchestration loading only the active global dataset, plus public exports, rule metadata, rule IDs, and preset membership.

The full `pnpm verify` gate must pass before review and handoff.

## Delivery

Both `@cloudburn/rules` and `@cloudburn/sdk` receive minor changesets. The pull request uses the repository template, includes a Mermaid data-flow diagram, carries the `enhancement` label, and requests review from `dannysteenman`.
