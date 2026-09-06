# Adding a Rule

Step-by-step guide using `CLDBRN-AWS-EBS-1` as the reference implementation.

Use this guide for both:

- adding a rule to an existing AWS service that already has a dataset
- adding a rule for a new AWS service after its dataset is in place

## 1. Choose an ID

Use `CLDBRN-{PROVIDER}-{SERVICE}-{N}` and consult the [ID convention](../reference/rule-ids.md#id-convention) before
assigning a number. The reference owns sequence rules, allocated slots, and the test enforcement gap. Review the
[compatibility status](../reference/rule-ids.md#compatibility-status) before removing or reordering a published rule.

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

Use the [EBS current-generation rule](../../packages/rules/src/aws/ebs/volume-type-current-gen.ts) as the executable
reference for a dual-mode declaration, matching resource identities, and finding precedence. Its implementation and
[helpers](../../packages/rules/src/shared/helpers.ts) own the current signatures; adapt the policy to your new rule.

Key patterns:

- Use `createRule()` for all built-in rules.
- Add a generic rule-level `message` that works for both discovery and IaC.
- Assign `high`, `medium`, or `low` severity from the rule's relative cost impact and pass the same value to
  `createFinding()`.
- For static IaC rules, declare `staticDependencies` dataset keys.
- For live AWS rules, declare `discoveryDependencies` dataset keys.
- Use `optionalDiscoveryDependencies` only when the evaluator can improve its decision with a dataset requested by
  another active rule but can still reach a valid result when that dataset is absent or unavailable. Optional
  dependencies do not trigger dataset loading on their own.
- Use `supersedesRuleIds` only when this rule's emitted identity is stronger evidence for the same resource and action.
  The target finding remains unless both rules are active and this rule emits the identical resource namespace, ID,
  account, and Region.
- Reuse an existing dataset key when the service already exposes the normalized fields you need.
- If the same policy should work in both scan modes, keep the static and discovery predicates aligned and extract shared helpers when that reduces duplication.
- Read static data from `StaticEvaluationContext.resources` with `resources.get('<dataset-key>')`.
- Read discovery data from `LiveEvaluationContext.resources` with `resources.get('<dataset-key>')`.
- Do not declare Terraform type strings, CloudFormation type strings, Resource Explorer `resourceTypes`, or loader wiring in rule files.
- Return one grouped `Finding` or `null`, never a flat `Finding[]`.
- Keep `ruleId`, `service`, `severity`, `source`, and `message` on the parent group.
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

`awsCorePreset` in `packages/rules/src/presets/aws-core.ts` normally includes IDs from `awsRules`. Rules that require account-wide infrastructure or other explicit setup can be excluded from the preset and enabled by users through `enabled-rules`. Document any opt-in requirement in [`rule-ids.md`](../reference/rule-ids.md).

The open-source SDK does not own downstream product profiles. Applications can deliberately include a new rule in a
product by adding its public ID to `config.discovery.enabledRules`. Keep generic rule metadata and normalized resource
evidence in the rule and SDK dataset registry; keep product-specific selection, remediation policy, and presentation in
the consuming application.

## 7. Update rule-ids.md

Add a row to the Rule Table in [`rule-ids.md`](../reference/rule-ids.md) for the new rule:

```md
| `CLDBRN-AWS-EBS-1` | medium | Flags previous-generation EBS volume types ... | ebs | discovery, iac |
```

Columns: `ID`, `Severity`, `Description`, `Service`, `Supports`. The description should explain what the rule flags, including thresholds and skip conditions.

## 8. Write Tests

All tests live in `packages/rules/test/`.

- `exports.test.ts` verifies the package export surface remains valid.
- `rule-metadata.test.ts` verifies metadata fields are populated.
- Add a rule-specific evaluator test file for behavior.

Use the [EBS evaluator tests](../../packages/rules/test/volume-type-current-gen.test.ts) for fixture builders,
`LiveResourceBag` / `StaticResourceBag` setup, complete finding assertions, and non-matching cases. Assert group-level
`severity` and the resource identity fields emitted by the rule, including live `resourceType` where applicable.

For dual-mode rules on an existing service, add both live and static evaluator coverage unless the rule is intentionally single-mode.

For IaC-capable rules, do not stop at one source kind:

- Add evaluator coverage for Terraform-shaped static resources.
- Add evaluator coverage for CloudFormation-shaped static resources.
- Add or extend SDK static dataset/scanner tests when needed so both source kinds are exercised through the loading pipeline.

## 9. Verify

Run the new evaluator file while iterating, for example:

```bash
pnpm --filter @cloudburn/rules exec vitest run test/volume-type-current-gen.test.ts
```

Then run `pnpm verify` for metadata, package boundaries, source tests, and installed-package behavior. Follow the
[release guide](releasing.md) for the changeset required by a user-facing rule addition.

The SDK later groups these rule-level findings under providers in the public `ScanResult`.
