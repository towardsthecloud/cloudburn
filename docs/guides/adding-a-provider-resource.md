# Adding a Provider Resource

Use this guide when a new AWS service needs live discovery support. For static IaC datasets, use [adding-a-static-dataset.md](./adding-a-static-dataset.md).

See [`docs/architecture/sdk.md`](../architecture/sdk.md) for the full live scan engine flow. Before creating a new dataset, check whether the service already has one you can reuse or extend (see step 2 in [`adding-a-rule.md`](adding-a-rule.md)).

## 1. Pick a Dataset Key

Define a dataset key in `@cloudburn/rules` metadata that represents one normalized resource collection.

Use dataset-oriented keys, not service buckets:

- `aws-rds-instances`
- `aws-rds-clusters`
- `aws-ec2-load-balancers`

## 2. Add the Rule-Facing Type

Add or reuse a normalized model in `packages/rules/src/shared/metadata.ts`.

```ts
export type AwsEc2Instance = {
  instanceId: string;
  instanceType: string;
  region: string;
  accountId: string;
};
```

Register the key in `DiscoveryDatasetKey` and its shape in `DiscoveryDatasetMap` in
[metadata.ts](../../packages/rules/src/shared/metadata.ts). For a concept shared with IaC, also add it to
`SharedDatasetKey` and `StaticDatasetMap`; `DiscoveryDatasetKey` is a separate explicit union.
Export new normalized types through the [rules package entry point](../../packages/rules/src/index.ts) so the SDK can import them.
The map entry looks like:

```ts
export type DiscoveryDatasetMap = {
  'aws-ec2-instances': AwsEc2Instance[];
};
```

## 3. Add a Dataset Loader

Create or update `packages/sdk/src/providers/aws/resources/{service}.ts`.

Dataset loaders should:

- receive only catalog resources matched for the dataset
- use narrow AWS APIs only when catalog fields are insufficient
- normalize into the rule-facing dataset type
- fail loudly when the underlying AWS API call fails
- group work by region and bound in-flight hydration concurrency when the loader fans out per resource

```ts
export const hydrateAwsEc2Instances = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsEc2Instance[]> => {
  // group by region, call DescribeInstances, normalize
};
```

Use the [shared AWS client factories](../../packages/sdk/src/providers/aws/client.ts) and
`withAwsServiceErrorContext` from [resource utilities](../../packages/sdk/src/providers/aws/resources/utils.ts) when
adding service calls. The [EC2 loader](../../packages/sdk/src/providers/aws/resources/ec2.ts) shows how these preserve
per-run credentials, timeouts, retry handling, and shared service budgets.

Propagate API failures to discovery orchestration. It records diagnostics and marks required evidence unavailable;
returning an empty successful dataset can make a failed load appear to pass a rule.

For CloudWatch-backed datasets, use `fetchCloudWatchSignals` from the
[metric helper](../../packages/sdk/src/providers/aws/resources/cloudwatch.ts). Select a rolling or complete-day window
explicitly with `cloudWatchWindow`; aggregation periods must not shift the observation window. Inspect evidence status
through `getCompleteCloudWatchPoints`, then enforce the service's required interval coverage. Treat absent, partial,
forbidden, and failed series as unknown. Do not fill sparse values with zero without a documented service guarantee.

Keep candidate identities when metrics are unknown, using nullable metric fields or a required base inventory dataset.
Add `getLiveEvaluationCoverage` to dependent rules so those candidates remain visible in evaluation coverage. See the
[rules architecture](../architecture/rules.md) for the pure coverage callback and the
[SDK metric evidence contract](../architecture/sdk.md#cloudwatch-metric-evidence) for normalization and retries.

## 4. Register the Dataset in SDK Discovery

Update `packages/sdk/src/providers/aws/discovery-registry.ts` with:

- `datasetKey`
- `service` (extend the `AwsDiscoveryDatasetDefinition` service union for a new service)
- required `resourceTypes`
- `dependencies`, including every dataset requested through the loader context
- `catalogQueries` for additional filtered catalog evidence requested through `context.listResourcesByFilter`
- `schemaVersion` for normalized evidence shape and `loaderVersion` for collection semantics
- `freshness.ttlMs` and `freshness.observation` matching the loader's actual observation window
- `load` function
- `toEvaluationResources` when callers need auditable discovery results

```ts
'aws-ec2-instances': {
  datasetKey: 'aws-ec2-instances',
  dependencies: [],
  schemaVersion: '1',
  loaderVersion: '1',
  freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
  service: 'ec2',
  resourceTypes: ['ec2:instance'],
  load: hydrateAwsEc2Instances,
  toEvaluationResources: (instances) =>
    mapEvaluationResources(instances, (instance) => instance.instanceId, (instance) => ({
      createdAt: instance.launchTime,
    })),
}
```

Declare derived dataset dependencies in the registry even when a loader already calls `context.loadDataset`.
Discovery resolves them before loading the derived dataset, includes their resource types in catalog selection,
and fingerprints their evidence for cache invalidation. Unknown dependencies and cycles are rejected before loading.
Keep optional rule evidence in `optionalDiscoveryDependencies`; it is distinct from a loader's required dependencies.
For filtered Resource Explorer evidence, declare the exact `filterString`, `requiredViewProperties`, and `scope`
in `catalogQueries`. Discovery resolves and fingerprints these queries before dataset cache lookup so a cached
dataset cannot skip view authorization checks or catalog membership refresh. For example, the untagged-resource
dataset declares `resourcetype.supports:tags tag:none` with the `tags` view property and `account` scope.

Use `{ kind: 'current' }` for current inventory, configuration, and provider-defined recommendation snapshots.
For fixed lookback windows, declare `{ kind: 'window', lookbackMs, alignmentMs }`: complete UTC days use
`alignmentMs: 86_400_000`, while rolling CloudWatch windows use `alignmentMs: 60_000`.
Calendar billing periods use `{ kind: 'calendar-months', months }` for complete months preceding the current month.
The resolved start and end must match the timestamps actually used by the loader. For multiple windows sharing an
end, declare the longest lookback and increment `loaderVersion` whenever the other windows change.

Increment `schemaVersion` when the normalized evidence contract changes and `loaderVersion` when collection,
normalization, or observation semantics change. Both versions participate in cache identity. Initial freshness
proposals are 10 minutes for inventory/configuration, 5 minutes for activity, and 6 hours for billing and
recommendations; they are tunable policies, not measured optimal defaults. The observation window can expire
before the TTL when an aligned time boundary changes.

Cache coverage uses every applicable built-in `getLiveEvaluationCoverage` contract whose required datasets are
within the dataset's dependency closure, independently of the scan's selected rules. Unknown coverage takes
precedence when contracts disagree. Keep these callbacks accurate when adding or changing normalized evidence;
missing optional enrichment such as public pricing must not make otherwise complete activity unknown.
When rule coverage depends on unrelated datasets or policy exemptions, declare `getEvidenceCoverage` on the
dataset to assess its evidence directly. ELB request activity uses this override because cleanup rules can
assess an empty load balancer without complete request metrics; target-health data is not a dependency of
request-activity collection. The override keeps unsupported, missing, or incomplete request metrics unknown.
For inventory without a coverage callback, discovery reconciles the normalized projection with matching catalog
resources using account, region, resource type, and ARN or resource identifier. Catalog candidates missing from
hydration remain unknown. Enumeration seeds that project into multiple child identities, filtered resource
variants, and datasets without identity projections remain conservatively unknown when their completeness
cannot be established this way; those results are not reused as complete cache evidence. Successful empty
account-scoped datasets with no catalog candidates remain valid.

The projection owns stable identity, `resourceType`, and available display evidence such as ARN, name, creation time,
or last activity. Use a rule evaluation override only when a rule evaluates a different identity or joins multiple
datasets. Do not re-fetch or normalize this evidence in an SDK consumer.

`discoverAwsResources` in `packages/sdk/src/providers/aws/discovery.ts` already:

- collects dataset keys from active rules
- resolves registry entries
- unions required `resourceTypes`
- builds one Resource Explorer catalog
- loads only required datasets
- builds `LiveEvaluationContext` with `resources: LiveResourceBag`

Do not add service-specific branching to discovery orchestration.

## 5. Write or Update Rules

In `@cloudburn/rules`, consume the dataset key:

```ts
discoveryDependencies: ['aws-ec2-instances'],
evaluateLive: ({ resources }) => {
  const findings = resources
    .get('aws-ec2-instances')
    .filter((instance) => instance.instanceType === 't3.nano')
    .map((instance) => ({
      resourceId: instance.instanceId,
      region: instance.region,
      accountId: instance.accountId,
    }));

  return createFinding(rule, 'discovery', findings);
};
```

## 6. Verify

Cover the loader and its orchestration before running the full gate. Existing examples:

- [EC2 hydration tests](../../packages/sdk/test/providers/aws-ec2-resource.test.ts) for hydration and normalization.
- [Discovery orchestration tests](../../packages/sdk/test/providers/aws-discovery.test.ts) for dataset selection and availability.
- [Discovery HTTP integration](../../packages/sdk/test/discovery-http-integration.test.ts) for the real SDK pipeline with synthetic transport responses.

```bash
pnpm --filter @cloudburn/sdk exec vitest run test/providers/aws-ec2-resource.test.ts
pnpm verify
```

Substitute the affected loader test when working on another service. Document IAM permissions for new API calls in the
[SDK README](../../packages/sdk/README.md#live-discovery) and keep the [live scan architecture](../architecture/sdk.md#live-scan)
consistent with any new orchestration constraints.

For existing services such as S3, prefer extending the existing discovery dataset and hydrator instead of adding a second service-specific path for a closely related rule family.
