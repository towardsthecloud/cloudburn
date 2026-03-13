# @cloudburn/rules

Pure rule packs, helpers, and types for CloudBurn.

This package has no I/O, no AWS SDK calls, and no engine logic. It gives you the built-in rule sets, the rule authoring helpers, and the type contracts you need if you want to extend CloudBurn with your own rules.

If you just want to run scans, use `cloudburn` or `@cloudburn/sdk`. Reach for `@cloudburn/rules` when you want to inspect built-in rule packs or author your own.

## Installation

```bash
npm install @cloudburn/rules
```

## What's In The Box

- Built-in rule packs like `awsRules`
- Presets like `awsCorePreset`
- Rule authoring helpers like `createRule`, `createFinding`, and `createFindingMatch`
- Shared rule types plus `LiveResourceBag` and `StaticResourceBag` for evaluation and tests

## Getting Started

You can import the built-in rules directly:

```ts
import { awsCorePreset, awsRules } from '@cloudburn/rules';

console.log(awsCorePreset.id);
console.log(awsRules.length);
```

Or write your own rule pack on top of the same contracts:

```ts
import { createFinding, createFindingMatch, createRule } from '@cloudburn/rules';

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
  supports: ['discovery'],
  discoveryDependencies: ['aws-ebs-volumes'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-ebs-volumes')
      .filter((volume) => volume.volumeType === 'gp2')
      .map((volume) => createFindingMatch(volume.volumeId, volume.region, volume.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
```

## Docs

- Full docs: [cloudburn.io/docs](https://cloudburn.io/docs)
- Rule reference: [docs/reference/rule-ids.md](https://github.com/towardsthecloud/cloudburn/blob/main/docs/reference/rule-ids.md)
- Add a rule: [docs/guides/adding-a-rule.md](https://github.com/towardsthecloud/cloudburn/blob/main/docs/guides/adding-a-rule.md)

## License

Apache-2.0
