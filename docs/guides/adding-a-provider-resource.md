# Adding a Provider Resource

How to extend the SDK provider layer to discover a new AWS resource type, and wire it through to rule evaluation.

## Overview

Adding a new live AWS resource requires changes across two packages:

1. **`@cloudburn/rules`** — extend evaluation context types
2. **`@cloudburn/sdk`** — add discoverer and wire it into the scanner

For static Terraform scans, AWS `resource` blocks are already parsed into `StaticEvaluationContext.terraformResources`. Adding a new AWS Terraform rule usually does not require parser or static-context changes.

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

### Static Terraform support

No `StaticEvaluationContext` change is required for a new AWS Terraform rule. Static evaluators receive the shared Terraform catalog:

```typescript
export type StaticEvaluationContext = {
  terraformResources: IaCResource[];
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

## 4. Write the Static Rule Against `terraformResources`

If the rule supports Terraform scanning, filter `terraformResources` by Terraform resource type inside the rule:

```typescript
evaluateStatic: ({ terraformResources }) => {
  const findings = terraformResources
    .filter((resource) => resource.provider === 'aws' && resource.type === 'aws_instance')
    .filter((resource) => resource.attributes.instance_type === 't3.nano');

  // map findings here
}
```

## 5. Extend Terraform Parser (rarely needed)

The Terraform parser already extracts all AWS `resource` blocks (`aws_*`). Only change `packages/sdk/src/parsers/terraform.ts` when the generic extraction contract itself needs to expand, such as adding new providers or richer source-location capture.

## 6. Write Rules

With the context types extended, you can now write rules that use the new fields. See [adding-a-rule.md](./adding-a-rule.md).

## 7. Verify

```bash
pnpm verify   # lint + typecheck + test across all packages
```

Ensure no type errors in either `@cloudburn/rules` or `@cloudburn/sdk`. Live discovery additions still require `LiveEvaluationContext` updates; Terraform-only AWS rules should not require new static context fields.
