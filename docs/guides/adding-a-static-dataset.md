# Adding a Static Dataset

Use this guide when a new static IaC rule needs normalized Terraform or CloudFormation inputs from the SDK.

See [`docs/architecture/sdk.md`](../architecture/sdk.md) for the full static scan engine flow. Before creating a new dataset, check whether the service already has one you can reuse or extend (see step 2 in [`adding-a-rule.md`](adding-a-rule.md)).

## 1. Pick a Dataset Key

Define a dataset key in `@cloudburn/rules` metadata that represents one normalized static resource collection.

Use dataset-oriented keys, not parser-specific buckets:

- `aws-rds-instances`
- `aws-s3-bucket-analyses`
- `aws-ec2-load-balancers`

## 2. Add the Rule-Facing Type

Add or reuse a normalized static model in `packages/rules/src/shared/metadata.ts`.

```ts
export type AwsStaticEc2VpcEndpoint = {
  resourceId: string;
  serviceName: string | null;
  vpcEndpointType: string | null;
  location?: SourceLocation;
};
```

Register the dataset key and shape:

```ts
export type StaticDatasetMap = {
  'aws-ec2-vpc-endpoints': AwsStaticEc2VpcEndpoint[];
};
```

If the service also has a live discovery dataset for the same concept, prefer a shared base type for the common fields and keep the mode-specific identity fields separate.

## 3. Add a Dataset Loader

Update `packages/sdk/src/providers/aws/static-registry.ts` with a dataset definition that declares:

- `datasetKey`
- required `sourceKinds`
- source-native `resourceTypes`
- `load` function

Dataset loaders should:

- receive only IaC resources matched for the dataset
- own Terraform and CloudFormation type strings
- normalize computed or unresolved values into explicit `null` or defaulted states
- precompute `resourceId` and preferred source `location`
- preserve existing classification semantics when refactoring loader logic into shared helpers

```ts
'aws-ec2-vpc-endpoints': {
  datasetKey: 'aws-ec2-vpc-endpoints',
  sourceKinds: ['terraform', 'cloudformation'],
  resourceTypes: ['aws_vpc_endpoint', 'AWS::EC2::VPCEndpoint'],
  load: loadStaticEc2VpcEndpoints,
}
```

Do not add service-specific branching to `runStaticScan` or rule files.

## 4. Write or Update Rules

In `@cloudburn/rules`, consume the dataset key:

```ts
staticDependencies: ['aws-ec2-vpc-endpoints'],
evaluateStatic: ({ resources }) => {
  const findings = resources
    .get('aws-ec2-vpc-endpoints')
    .filter((endpoint) => endpoint.serviceName?.endsWith('.s3') && endpoint.vpcEndpointType === 'interface')
    .map((endpoint) => ({
      resourceId: endpoint.resourceId,
      location: endpoint.location,
    }));

  return createFinding(rule, 'iac', findings);
};
```

## 5. Verify

```bash
pnpm verify
```
