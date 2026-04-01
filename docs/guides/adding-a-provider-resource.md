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

Register the dataset key and shape:

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

## 4. Register the Dataset in SDK Discovery

Update `packages/sdk/src/providers/aws/discovery-registry.ts` with:

- `datasetKey`
- required `resourceTypes`
- `load` function

```ts
'aws-ec2-instances': {
  datasetKey: 'aws-ec2-instances',
  resourceTypes: ['ec2:instance'],
  load: hydrateAwsEc2Instances,
}
```

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

```bash
pnpm verify
```

Also document IAM permissions for any new loader-backed AWS API calls.

For existing services such as S3, prefer extending the existing discovery dataset and hydrator instead of adding a second service-specific path for a closely related rule family.
