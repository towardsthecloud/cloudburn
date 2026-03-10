# Adding a Provider Resource

How to extend live AWS discovery when a new rule needs another Resource Explorer type or a new hydrator.

## Overview

Adding a new live AWS resource now follows the same high-level pattern as static IaC scanning:

1. `@cloudburn/rules` declares what the rule needs from the shared discovery catalog
2. `@cloudburn/sdk` lists Resource Explorer resources for those resource types
3. The SDK optionally hydrates the matching catalog entries with service-specific data
4. The rule evaluates against normalized hydrated models

This replaces the old per-service, per-region fan-out discoverer model.

## 1. Declare Catalog Requirements in the Rule

Live discovery rules must declare `liveDiscovery` metadata in `packages/rules/src/shared/metadata.ts` via `createRule()`:

```typescript
liveDiscovery: {
  resourceTypes: ['ec2:instance'],
  hydrator: 'aws-ec2-instance',
}
```

- `resourceTypes` are Resource Explorer resource type identifiers.
- `hydrator` is optional. Omit it when the catalog already includes everything the rule needs.

Rules still read from `LiveEvaluationContext`. If a rule needs new hydrated fields, extend that context type in `@cloudburn/rules`.

## 2. Add or Reuse a Hydrated Model

If the rule needs fields that Resource Explorer does not provide directly, add a normalized model in `packages/rules/src/shared/metadata.ts`:

```typescript
export type AwsEc2Instance = {
  instanceId: string;
  instanceType: string;
  region: string;
  accountId: string;
};
```

Then extend `LiveEvaluationContext`:

```typescript
export type LiveEvaluationContext = {
  catalog: AwsDiscoveryCatalog;
  ebsVolumes: AwsEbsVolume[];
  lambdaFunctions: AwsLambdaFunction[];
  ec2Instances: AwsEc2Instance[];
};
```

## 3. Implement the Hydrator in the SDK

Create or update `packages/sdk/src/providers/aws/resources/{service}.ts`.

Hydrators receive catalog resources that have already been filtered by Resource Explorer type. They should:

- reuse one AWS client per region
- fetch only the matched resources
- normalize service responses into the shared rule-facing type
- fail loudly if the underlying AWS call fails

Example shape:

```typescript
export const hydrateAwsEc2Instances = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsEc2Instance[]> => {
  // group by region, batch ids, call the narrow AWS API, normalize output
};
```

Pattern: hydrate only the matched candidates, not the whole account.

## 4. Wire the Hydrator Into the AWS Scanner

Update `packages/sdk/src/providers/aws/scanner.ts` to recognize the new hydrator key:

```typescript
const [ec2Instances] = await Promise.all([
  requirements.hydrators.has('aws-ec2-instance')
    ? hydrateAwsEc2Instances(ec2Resources)
    : Promise.resolve([]),
]);
```

The scanner already:

- collects unique `resourceTypes` from active rules
- builds one Resource Explorer catalog
- filters catalog resources by type
- invokes only the hydrators required by active rules

Keep that model intact. Do not reintroduce account-wide service discovery fan-out.

## 5. Write the Rule

With the hydrated model available, implement the rule in `@cloudburn/rules` and keep it pure:

```typescript
evaluateLive: ({ ec2Instances }) => {
  const findings = ec2Instances
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

Also document any new IAM requirements. Resource Explorer remains the discovery source of truth, but each hydrator still needs its own narrow AWS permissions.
