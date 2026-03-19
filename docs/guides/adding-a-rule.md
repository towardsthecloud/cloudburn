# Adding a Rule

Step-by-step guide using `CLDBRN-AWS-EBS-1` as the reference implementation.

Use this guide for both:

- adding a rule to an existing AWS service that already has a dataset
- adding a rule for a new AWS service after its dataset is in place

## 1. Choose an ID

Format: `CLDBRN-{PROVIDER}-{SERVICE}-{N}`. Check [rule-ids.md](../reference/rule-ids.md) for the next contiguous number in your service. Keep each provider/service sequence gap-free, and if you remove or reorder a rule, renumber later IDs and update references in the same change.

## 2. Decide Whether You Need a Dataset Change

Before writing the rule, check whether the target service already exposes a normalized dataset in `packages/rules/src/shared/metadata.ts`.

- If the existing dataset already contains the fields your rule needs, reuse it. Only add the rule and tests.
- If the service already exists but the dataset is missing required fields, extend the existing normalized dataset instead of inventing a second overlapping dataset.
- If the rule should behave the same in both `iac` and `discovery`, prefer one shared dataset key across `StaticDatasetMap` and `DiscoveryDatasetMap`, as with `aws-s3-bucket-analyses`.
- If no dataset exists yet, add one first with:
  - [adding-a-static-dataset.md](./adding-a-static-dataset.md) for IaC
  - [adding-a-provider-resource.md](./adding-a-provider-resource.md) for discovery

## 3. Create the Rule File

Place it in `packages/rules/src/{provider}/{service}/{kebab-case-name}.ts`.

Example: `packages/rules/src/aws/ebs/volume-type-current-gen.ts`

```ts
import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EBS-1';
const RULE_SERVICE = 'ebs';
const RULE_MESSAGE = 'EBS volumes should use current-generation storage.';

export const ebsVolumeTypeCurrentGenRule = createRule({
  id: RULE_ID,
  name: 'EBS Volume Type Not Current Generation',
  description: 'Flag EBS volumes using previous-generation gp2 type instead of gp3.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery', 'iac'],
  discoveryDependencies: ['aws-ebs-volumes'],
  staticDependencies: ['aws-ebs-volumes'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ebs-volumes')
      .filter((volume) => volume.volumeType === 'gp2')
      .map((volume) => createFindingMatch(volume.volumeId, volume.region, volume.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-ebs-volumes')
      .filter((volume) => volume.volumeType === 'gp2')
      .map((volume) => createFindingMatch(volume.resourceId, undefined, undefined, volume.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
```

Key patterns:

- Use `createRule()` for all built-in rules.
- Add a generic rule-level `message` that works for both discovery and IaC.
- For static IaC rules, declare `staticDependencies` dataset keys.
- For live AWS rules, declare `discoveryDependencies` dataset keys.
- Reuse an existing dataset key when the service already exposes the normalized fields you need.
- If the same policy should work in both scan modes, keep the static and discovery predicates aligned and extract shared helpers when that reduces duplication.
- Read static data from `StaticEvaluationContext.resources` with `resources.get('<dataset-key>')`.
- Read discovery data from `LiveEvaluationContext.resources` with `resources.get('<dataset-key>')`.
- Do not declare Terraform type strings, CloudFormation type strings, Resource Explorer `resourceTypes`, or loader wiring in rule files.
- Return one grouped `Finding` or `null`, never a flat `Finding[]`.
- Keep `ruleId`, `service`, `source`, and `message` on the parent group.
- Put only varying resource-level data on each `FindingMatch`.
- Omit unavailable `accountId` and `region` fields instead of emitting empty strings.

## 4. Register in the Service Index

Add your rule export to `packages/rules/src/aws/{service}/index.ts`:

```ts
import { ebsVolumeTypeCurrentGenRule } from './volume-type-current-gen.js';

export const ebsRules = [ebsVolumeTypeCurrentGenRule];
```

If this is a new service, create the `index.ts` and add the service rules array to the provider index.

## 5. Register in the Provider Index

Ensure the service array is spread into `packages/rules/src/aws/index.ts`:

```ts
export const awsRules = [...ec2Rules, ...ebsRules, ...rdsRules, ...s3Rules, ...lambdaRules];
```

## 6. Preset Inclusion

`awsCorePreset` in `packages/rules/src/presets/aws-core.ts` uses `toRuleIds(awsRules)`, so new rules are automatically included when added to `awsRules`. No manual preset change is needed.

## 7. Write Tests

All tests live in `packages/rules/test/`.

- `exports.test.ts` verifies the package export surface remains valid.
- `rule-metadata.test.ts` verifies metadata fields are populated.
- Add a rule-specific evaluator test file for behavior.

Pattern:

```ts
import { describe, expect, it } from 'vitest';
import { ebsVolumeTypeCurrentGenRule } from '../src/aws/ebs/volume-type-current-gen.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';
import type { AwsEbsVolume, AwsStaticEbsVolume } from '../src/index.js';

const createVolume = (overrides: Partial<AwsEbsVolume> = {}): AwsEbsVolume => ({
  accountId: '123456789012',
  volumeId: 'vol-test',
  volumeType: 'gp2',
  region: 'us-east-1',
  ...overrides,
});

const createStaticVolume = (overrides: Partial<AwsStaticEbsVolume> = {}): AwsStaticEbsVolume => ({
  resourceId: 'aws_ebs_volume.logs',
  volumeType: 'gp2',
  ...overrides,
});

describe('CLDBRN-AWS-EBS-1', () => {
  it('groups matching discovery resources under one rule finding', () => {
    const finding = ebsVolumeTypeCurrentGenRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [createVolume()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EBS-1',
      service: 'ebs',
      source: 'discovery',
      message: 'EBS volumes should use current-generation storage.',
      findings: [
        {
          resourceId: 'vol-test',
          region: 'us-east-1',
          accountId: '123456789012',
        },
      ],
    });
  });

  it('returns null when nothing matches', () => {
    const finding = ebsVolumeTypeCurrentGenRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [createVolume({ volumeType: 'gp3' })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('groups matching static resources under one rule finding', () => {
    const finding = ebsVolumeTypeCurrentGenRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ebs-volumes': [createStaticVolume()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EBS-1',
      service: 'ebs',
      source: 'iac',
      message: 'EBS volumes should use current-generation storage.',
      findings: [
        {
          resourceId: 'aws_ebs_volume.logs',
        },
      ],
    });
  });
});
```

For dual-mode rules on an existing service, add both live and static evaluator coverage unless the rule is intentionally single-mode.

For IaC-capable rules, do not stop at one source kind:

- Add evaluator coverage for Terraform-shaped static resources.
- Add evaluator coverage for CloudFormation-shaped static resources.
- Add or extend SDK static dataset/scanner tests when needed so both source kinds are exercised through the loading pipeline.

## 8. Verify

```bash
pnpm verify
```

The SDK later groups these rule-level findings under providers in the public `ScanResult`.
