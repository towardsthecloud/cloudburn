# Adding a Provider Resource

How to extend the SDK provider layer to discover a new AWS resource type, and wire it through to rule evaluation.

## Overview

Adding a new resource requires changes across two packages:

1. **`@cloudburn/rules`** — extend evaluation context types
2. **`@cloudburn/sdk`** — add discoverer, wire into scanner, extend static context mapping

## 1. Add Resource Types to Rules

### Live resource type

Add a new type in `packages/rules/src/shared/metadata.ts`:

```typescript
export type AwsEc2Instance = {
  instanceId: string;
  instanceType: string;
  region: string;
};
```

### Extend `LiveEvaluationContext`

In the same file, add the new field:

```typescript
export type LiveEvaluationContext = {
  ebsVolumes: AwsEbsVolume[];
  ec2Instances: AwsEc2Instance[];   // new
};
```

### IaC resource type (if supporting static scans)

```typescript
export type AwsEc2InstanceDefinition = {
  resourceId: string;
  instanceType: string;
};
```

### Extend `StaticEvaluationContext`

```typescript
export type StaticEvaluationContext = {
  awsEbsVolumes: AwsEbsVolumeDefinition[];
  awsEc2Instances: AwsEc2InstanceDefinition[];   // new
};
```

## 2. Add the Discoverer

Create `packages/sdk/src/providers/aws/resources/{service}.ts`.

Reference implementation: `ebs.ts` (uses `paginateDescribeVolumes`).

```typescript
import { paginateDescribeInstances, EC2Client } from '@aws-sdk/client-ec2';
import type { AwsEc2Instance } from '@cloudburn/rules';
import { createEc2Client } from '../client.js';

export const discoverAwsEc2Instances = async (regions: string[]): Promise<AwsEc2Instance[]> => {
  const results = await Promise.all(
    regions.map(async (region) => {
      const client = createEc2Client({ region });
      const instances: AwsEc2Instance[] = [];
      for await (const page of paginateDescribeInstances({ client }, {})) {
        for (const reservation of page.Reservations ?? []) {
          for (const instance of reservation.Instances ?? []) {
            if (instance.InstanceId && instance.InstanceType) {
              instances.push({
                instanceId: instance.InstanceId,
                instanceType: instance.InstanceType,
                region,
              });
            }
          }
        }
      }
      return instances;
    }),
  );
  return results.flat();
};
```

Pattern: fan out across regions in parallel with `Promise.all`, paginate the AWS API, skip entries with missing required fields.

## 3. Wire Into `scanAwsResources`

Update `packages/sdk/src/providers/aws/scanner.ts`:

```typescript
import { discoverAwsEbsVolumes } from './resources/ebs.js';
import { discoverAwsEc2Instances } from './resources/ec2.js';   // new

export const scanAwsResources = async (regions: string[]): Promise<LiveEvaluationContext> => {
  const resolvedRegions = await resolveAwsRegions(regions);
  return {
    ebsVolumes: await discoverAwsEbsVolumes(resolvedRegions),
    ec2Instances: await discoverAwsEc2Instances(resolvedRegions),   // new
  };
};
```

## 4. Extend Static Context Mapping

Update `toStaticContext()` in `packages/sdk/src/engine/run-static.ts` to map the new resource type from `IaCResource[]`:

```typescript
const toStaticContext = (resources: IaCResource[]): StaticEvaluationContext => ({
  awsEbsVolumes: resources
    .filter((r) => r.type === 'aws_ebs_volume')
    .map((r) => ({ resourceId: r.name, volumeType: r.attributes.type as string })),
  awsEc2Instances: resources                                      // new
    .filter((r) => r.type === 'aws_instance')
    .map((r) => ({ resourceId: r.name, instanceType: r.attributes.instance_type as string })),
});
```

## 5. Extend Terraform Parser (if needed)

If the parser only extracts specific resource types, update `packages/sdk/src/parsers/terraform.ts` to include the new Terraform resource type (e.g. `aws_instance`) in its extraction logic.

## 6. Write Rules

With the context types extended, you can now write rules that use the new fields. See [adding-a-rule.md](./adding-a-rule.md).

## 7. Verify

```bash
pnpm verify   # lint + typecheck + test across all packages
```

Ensure no type errors in either `@cloudburn/rules` or `@cloudburn/sdk` — extending the context types may require updating existing evaluator signatures and tests.
