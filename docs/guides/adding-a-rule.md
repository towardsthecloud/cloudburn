# Adding a Rule

Step-by-step guide using `CLDBRN-AWS-EBS-1` as the reference implementation.

## 1. Choose an ID

Format: `CLDBRN-{PROVIDER}-{SERVICE}-{N}`. Check [rule-ids.md](../reference/rule-ids.md) for the next available number in your service. Never reuse or renumber existing IDs.

## 2. Create the Rule File

Place it in `packages/rules/src/{provider}/{service}/{kebab-case-name}.ts`.

Example: `packages/rules/src/aws/ebs/volume-type-current-gen.ts`

```typescript
import { createRule, type Finding, type LiveEvaluationContext, type StaticEvaluationContext } from '../../shared/index.js';

const RULE_ID = 'CLDBRN-AWS-EBS-1';

const createFinding = (resourceId: string, source: 'discovery' | 'iac', region: string): Finding => ({
  id: `${RULE_ID}:${resourceId}`,
  ruleId: RULE_ID,
  message: `EBS volume ${resourceId} uses gp2; migrate to gp3.`,
  resource: {
    provider: 'aws',
    accountId: '',     // always '' — SDK injects real value
    region,
    service: 'ebs',
    resourceId,
  },
  source,
});

export const ebsVolumeTypeCurrentGenRule = createRule({
  id: RULE_ID,
  name: 'EBS Volume Type Not Current Generation',
  description: 'Flag EBS volumes using previous-generation gp2 type instead of gp3.',
  provider: 'aws',
  service: 'ebs',
  supports: ['discovery', 'iac'],
  evaluateLive: ({ ebsVolumes }: LiveEvaluationContext): Finding[] =>
    ebsVolumes
      .filter((v) => v.volumeType === 'gp2')
      .map((v) => createFinding(v.volumeId, 'discovery', v.region)),
  evaluateStatic: ({ awsEbsVolumes }: StaticEvaluationContext): Finding[] =>
    awsEbsVolumes
      .filter((v) => v.volumeType === 'gp2')
      .map((v) => createFinding(v.resourceId, 'iac', '')),
});
```

Key patterns:

- Use `createRule()` — mandatory convention.
- `supports` declares which scan modes the rule implements.
- Set `accountId: ''` and `region: ''` (for IaC) — the SDK fills these in post-evaluation.
- Finding `id` is always `{ruleId}:{resourceId}`.

## 3. Register in the Service Index

Add your rule export to `packages/rules/src/aws/{service}/index.ts`:

```typescript
import { ebsVolumeTypeCurrentGenRule } from './volume-type-current-gen.js';

export const ebsRules = [ebsVolumeTypeCurrentGenRule];
```

If this is a new service, create the `index.ts` and add the service rules array to the provider index.

## 4. Register in the Provider Index

Ensure the service array is spread into `packages/rules/src/aws/index.ts`:

```typescript
export const awsRules = [...ec2Rules, ...ebsRules, ...rdsRules, ...s3Rules, ...lambdaRules];
```

## 5. Preset Inclusion

`awsCorePreset` in `packages/rules/src/presets/aws-core.ts` uses `toRuleIds(awsRules)`, so new rules are automatically included when added to `awsRules`. No manual preset change needed.

## 6. Write Tests (Three Layers)

All tests live in `packages/rules/test/`.

### Layer 1 — Export surface (`exports.test.ts`)

Existing tests verify `awsRules` is non-empty and `awsCorePreset.ruleIds.length === awsRules.length`. Adding a rule to the service index is sufficient — no test changes needed unless you add a new provider.

### Layer 2 — Metadata contract (`rule-metadata.test.ts`)

Existing tests iterate all rules and verify `id`, `name`, `description`, and `supports` are non-empty. No changes needed.

### Layer 3 — Evaluator behavior (new test file)

Create `packages/rules/test/{kebab-case-name}.test.ts`. Pattern:

```typescript
import { describe, expect, it } from 'vitest';
import { ebsVolumeTypeCurrentGenRule } from '../src/aws/ebs/volume-type-current-gen.js';
import type { AwsEbsVolume } from '../src/shared/metadata.js';

const createVolume = (overrides?: Partial<AwsEbsVolume>): AwsEbsVolume => ({
  volumeId: 'vol-test',
  volumeType: 'gp2',
  region: 'us-east-1',
  ...overrides,
});

describe('CLDBRN-AWS-EBS-1', () => {
  describe('evaluateLive', () => {
    it('flags gp2 volumes', () => {
      const findings = ebsVolumeTypeCurrentGenRule.evaluateLive!({
        ebsVolumes: [createVolume()],
      });
      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('CLDBRN-AWS-EBS-1');
    });

    it('skips gp3 volumes', () => {
      const findings = ebsVolumeTypeCurrentGenRule.evaluateLive!({
        ebsVolumes: [createVolume({ volumeType: 'gp3' })],
      });
      expect(findings).toHaveLength(0);
    });
  });
});
```

Test the full finding payload shape, both `evaluateLive` and `evaluateStatic`, and negative cases.

## 7. Verify

```bash
pnpm verify   # lint + typecheck + test across all packages
```
