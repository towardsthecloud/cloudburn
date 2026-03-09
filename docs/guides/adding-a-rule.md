# Adding a Rule

Step-by-step guide using `CLDBRN-AWS-EBS-1` as the reference implementation.

## 1. Choose an ID

Format: `CLDBRN-{PROVIDER}-{SERVICE}-{N}`. Check [rule-ids.md](../reference/rule-ids.md) for the next available number in your service. Never reuse or renumber existing IDs.

## 2. Create the Rule File

Place it in `packages/rules/src/{provider}/{service}/{kebab-case-name}.ts`.

Example: `packages/rules/src/aws/ebs/volume-type-current-gen.ts`

```ts
import { createFinding, createRule } from '../../shared/helpers.js';
import type {
  Finding,
  FindingMatch,
  IaCResource,
  LiveEvaluationContext,
  StaticEvaluationContext,
  SourceLocation,
} from '../../shared/metadata.js';

const RULE_ID = 'CLDBRN-AWS-EBS-1';
const RULE_MESSAGE = 'EBS volumes should use current-generation storage.';

const createFindingMatch = (resourceId: string, region?: string, location?: SourceLocation): FindingMatch => ({
  resourceId,
  ...(region ? { region } : {}),
  ...(location ? { location } : {}),
});

const isAwsEbsVolume = (resource: IaCResource): boolean =>
  resource.provider === 'aws' && resource.type === 'aws_ebs_volume';

export const ebsVolumeTypeCurrentGenRule = createRule({
  id: RULE_ID,
  name: 'EBS Volume Type Not Current Generation',
  description: 'Flag EBS volumes using previous-generation gp2 type instead of gp3.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: 'ebs',
  supports: ['discovery', 'iac'],
  evaluateLive: ({ ebsVolumes }: LiveEvaluationContext): Finding | null => {
    const findings = ebsVolumes
      .filter((volume) => volume.volumeType === 'gp2')
      .map((volume) => createFindingMatch(volume.volumeId, volume.region));

    return createFinding(ebsVolumeTypeCurrentGenRule, 'discovery', findings);
  },
  evaluateStatic: ({ iacResources }: StaticEvaluationContext): Finding | null => {
    const findings = iacResources
      .filter(isAwsEbsVolume)
      .filter((resource) => resource.attributes.type === 'gp2')
      .map((resource) =>
        createFindingMatch(
          `${resource.type}.${resource.name}`,
          undefined,
          resource.attributeLocations?.type ?? resource.location,
        ),
      );

    return createFinding(ebsVolumeTypeCurrentGenRule, 'iac', findings);
  },
});
```

Key patterns:

- Use `createRule()` for all built-in rules.
- Add a generic rule-level `message` that works for both discovery and IaC.
- For static IaC scans, filter `iacResources` by the source-native resource type inside the rule.
- Return one grouped `Finding` or `null`, never a flat `Finding[]`.
- Keep `ruleId`, `service`, `source`, and `message` on the parent group.
- Put only varying resource-level data on each `FindingMatch`.
- Omit unavailable `accountId` and `region` fields instead of emitting empty strings.

## 3. Register in the Service Index

Add your rule export to `packages/rules/src/aws/{service}/index.ts`:

```ts
import { ebsVolumeTypeCurrentGenRule } from './volume-type-current-gen.js';

export const ebsRules = [ebsVolumeTypeCurrentGenRule];
```

If this is a new service, create the `index.ts` and add the service rules array to the provider index.

## 4. Register in the Provider Index

Ensure the service array is spread into `packages/rules/src/aws/index.ts`:

```ts
export const awsRules = [...ec2Rules, ...ebsRules, ...rdsRules, ...s3Rules, ...lambdaRules];
```

## 5. Preset Inclusion

`awsCorePreset` in `packages/rules/src/presets/aws-core.ts` uses `toRuleIds(awsRules)`, so new rules are automatically included when added to `awsRules`. No manual preset change is needed.

## 6. Write Tests

All tests live in `packages/rules/test/`.

- `exports.test.ts` verifies the package export surface remains valid.
- `rule-metadata.test.ts` verifies metadata fields are populated.
- Add a rule-specific evaluator test file for behavior.

Pattern:

```ts
import { describe, expect, it } from 'vitest';
import { ebsVolumeTypeCurrentGenRule } from '../src/aws/ebs/volume-type-current-gen.js';
import type { AwsEbsVolume } from '../src/shared/metadata.js';

const createVolume = (overrides: Partial<AwsEbsVolume> = {}): AwsEbsVolume => ({
  volumeId: 'vol-test',
  volumeType: 'gp2',
  region: 'us-east-1',
  ...overrides,
});

describe('CLDBRN-AWS-EBS-1', () => {
  it('groups matching discovery resources under one rule finding', () => {
    const finding = ebsVolumeTypeCurrentGenRule.evaluateLive?.({
      ebsVolumes: [createVolume()],
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
        },
      ],
    });
  });

  it('returns null when nothing matches', () => {
    const finding = ebsVolumeTypeCurrentGenRule.evaluateLive?.({
      ebsVolumes: [createVolume({ volumeType: 'gp3' })],
    });

    expect(finding).toBeNull();
  });
});
```

## 7. Verify

```bash
pnpm verify
```

The SDK later groups these rule-level findings under providers in the public `ScanResult`.
