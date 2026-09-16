# @cloudburn/rules

Pure rule packs, helpers, and types for CloudBurn.

This package has no I/O, no AWS SDK calls, and no engine logic. It gives you the built-in rule sets, the rule authoring helpers, and the type contracts you need if you want to extend CloudBurn with your own rules.

If you just want to run scans, use `cloudburn` or `@cloudburn/sdk`. Reach for `@cloudburn/rules` when you want to inspect built-in rule packs or author your own.

## Installation

```bash
npm install @cloudburn/rules
```

## What's In The Box

- Complete built-in rule packs like `awsRules`
- Default subsets like `awsCorePreset`
- Rule authoring helpers like `createRule`, `createFinding`, and `createFindingMatch`
- Shared rule types plus `LiveResourceBag` and `StaticResourceBag` for evaluation and tests

## Getting Started

You can import the built-in rules directly:

```ts
import { awsCorePreset, awsRules } from '@cloudburn/rules';

console.log(awsCorePreset.id);
console.log(awsRules.length);
```

`awsRules` contains every public AWS rule. `awsCorePreset` is the default subset used by CloudBurn and excludes rules that need explicit AWS setup, including `CLDBRN-AWS-TAGGING-1`, `CLDBRN-AWS-LAMBDA-4`, and `CLDBRN-AWS-COSTOPTIMIZATIONHUB-1` through `CLDBRN-AWS-COSTOPTIMIZATIONHUB-6`.

Rule 3 evaluates AWS-classified idle capacity. `AwsCostOptimizationHubIdleRecommendation` preserves the exact action
and typed current/recommended configuration. EBS unattached-volume findings include `actionType: 'Delete'` and
`resourceType: 'ec2:volume'` so precedence requires the same resource and action.

Or write your own rule pack on top of the same contracts:

```ts
import { createFinding, createFindingMatch, createRule } from '@cloudburn/rules';

const RULE_ID = 'CLDBRN-AWS-EBS-1';
const RULE_SERVICE = 'ebs';
const RULE_MESSAGE = 'EBS volumes should use current-generation storage.';

export const ebsVolumeTypeCurrentGenRule = createRule({
  severity: 'medium',
  id: RULE_ID,
  name: 'EBS Volume Type Not Current Generation',
  description: 'Flag EBS volumes using previous-generation gp2 type instead of gp3.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ebs-volumes'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ebs-volumes')
      .filter((volume) => volume.volumeType === 'gp2')
      .map((volume) => createFindingMatch(volume.volumeId, volume.region, volume.accountId));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: 'medium', message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
```

## Capability metadata

`AWS_CAPABILITIES` is the closed catalog of AWS evidence capabilities that live discovery datasets require:

- `cost-optimization-hub-enrollment` — Cost Optimization Hub enrollment for Hub recommendation datasets.
- `compute-optimizer-enrollment` — Compute Optimizer opt-in for machine-learning recommendations such as Lambda memory sizing.
- `resource-explorer-aggregator` — an accessible Resource Explorer aggregator view for account-wide queries.
- `cost-explorer-access` — Cost Explorer API access for usage, anomaly, and coverage datasets.
- `budgets-access` — Budgets API access for budget guardrail datasets.

`AwsCapability` is the union of those values. `getAwsDatasetCapability(datasetKey)` maps a discovery dataset to its
required capability, or returns `undefined` for datasets with no capability requirement. `getAwsRuleCapabilities(rule)`
returns a fresh sorted, de-duplicated list of the capabilities a rule's required `discoveryDependencies` need;
`optionalDiscoveryDependencies` and rules that do not support `discovery` contribute nothing. Access-only capabilities
such as `cost-explorer-access` and `budgets-access` are listed like any other requirement but do not make a rule opt-in.

This is pure, read-only metadata: it describes declared dataset requirements, not live enrollment state. Runtime
readiness comes from `capabilities` on SDK discovery results.

```ts
import {
  AWS_CAPABILITIES,
  type Rule,
  getAwsDatasetCapability,
  getAwsRuleCapabilities,
} from '@cloudburn/rules';

const capability = getAwsDatasetCapability('aws-lambda-memory-recommendations');
const rule = {
  supports: ['discovery'],
  discoveryDependencies: ['aws-cost-usage'],
  optionalDiscoveryDependencies: ['aws-cost-optimization-hub-savings-plans-recommendations'],
} satisfies Pick<Rule, 'supports' | 'discoveryDependencies' | 'optionalDiscoveryDependencies'>;
const required = getAwsRuleCapabilities(rule);

console.log(AWS_CAPABILITIES, capability, required);
```

Here `capability` is `'compute-optimizer-enrollment'` and `required` is `['cost-explorer-access']`. Optional Hub evidence
is not a required capability, even when another active rule causes that dataset to be loaded.

## Docs

- Full docs: [cloudburn.io/docs](https://cloudburn.io/docs)
- Rule reference: [docs/reference/rule-ids.md](https://github.com/towardsthecloud/cloudburn/blob/main/docs/reference/rule-ids.md)
- Add a rule: [docs/guides/adding-a-rule.md](https://github.com/towardsthecloud/cloudburn/blob/main/docs/guides/adding-a-rule.md)

## License

Apache-2.0

## Hub rightsizing

`CLDBRN-AWS-COSTOPTIMIZATIONHUB-4` is an opt-in discovery rule. Its
`aws-cost-optimization-hub-rightsizing-recommendations` dataset contains
`AwsCostOptimizationHubRightsizingRecommendation`, a union discriminated by `resourceType` with typed
`currentConfiguration` and `recommendedConfiguration` fields for each of the 8 supported AWS resource types.
The evaluator accepts only `Rightsize` actions. See the [SDK discovery guidance](../sdk/README.md) for enrollment,
IAM permissions, evidence projection, and native-rule precedence.
