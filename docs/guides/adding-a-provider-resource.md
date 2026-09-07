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
- `load` function
- `toEvaluationResources` when callers need auditable discovery results

```ts
'aws-ec2-instances': {
  datasetKey: 'aws-ec2-instances',
  service: 'ec2',
  resourceTypes: ['ec2:instance'],
  load: hydrateAwsEc2Instances,
  toEvaluationResources: (instances) =>
    mapEvaluationResources(instances, (instance) => instance.instanceId, (instance) => ({
      createdAt: instance.launchTime,
    })),
}
```

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
