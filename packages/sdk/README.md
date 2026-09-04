# @cloudburn/sdk

The CloudBurn SDK lets you run the same cost policy engine inside your own codebase. It handles config loading, Terraform and CloudFormation parsing, live AWS discovery, and rule evaluation.

Use it when you want CloudBurn in internal tooling, custom automations, or your own platform instead of calling the CLI.

## Installation

```bash
npm install @cloudburn/sdk
```

## Getting Started

### Static scans

Use `scanStatic()` to run the built-in rules against Terraform or CloudFormation.

```ts
import { CloudBurnClient } from '@cloudburn/sdk';

const client = new CloudBurnClient();
const result = await client.scanStatic('./iac');

for (const providerGroup of result.providers) {
  for (const ruleGroup of providerGroup.rules) {
    console.log(
      providerGroup.provider,
      ruleGroup.ruleId,
      ruleGroup.severity,
      ruleGroup.source,
      ruleGroup.findings.length,
    );
  }
}
```

Static scans recognize resource-local `cloudburn-ignore <rule-id> [reason]` and `cloudburn-ignore-all [reason]`
comments in Terraform and CloudFormation YAML. Matches removed by these directives are retained in
`result.suppressed`; active findings remain in `result.providers`.

Both modes accept a `failOn` threshold. When configured, the SDK evaluates it and exposes the effective threshold,
qualifying finding count, and violation status on `result.policy`:

```ts
const result = await client.scanStatic('./iac', {
  iac: { failOn: 'high' },
});

if (result.policy?.violated) {
  console.error(`${result.policy.qualifyingFindingCount} high-severity findings`);
}
```

Use the exported `evaluateScanPolicy(result, threshold?)` helper to apply a runtime threshold or an any-finding policy
without rerunning the scan. SDK policy evaluation reports state; it does not change the host process exit code.

### Live discovery

Use `initializeDiscovery()` first to set up AWS Resource Explorer. CloudBurn uses it as the live service catalog before it runs discovery rules.

```ts
import { CloudBurnClient } from '@cloudburn/sdk';

const client = new CloudBurnClient();

await client.initializeDiscovery();

const currentRegion = await client.discover();
const explicitRegion = await client.discover({
  target: { mode: 'regions', regions: ['eu-central-1'] },
});
const multipleRegions = await client.discover({
  target: { mode: 'regions', regions: ['eu-central-1', 'us-east-1'] },
});
const auditableResult = await client.discover({
  includeEvaluationResources: true,
  config: {
    discovery: {
      enabledRules: ['CLDBRN-AWS-CLOUDWATCH-1', 'CLDBRN-AWS-CLOUDWATCH-2'],
    },
  },
});
```

`discover()` defaults to the current AWS region and the AWS Core preset. You can also target one or more explicit AWS regions with `{ target: { mode: 'regions', regions: [...] } }`. Multi-region discovery requires an AWS Resource Explorer aggregator index. Rules that need explicit AWS setup are opt-in through `config.discovery.enabledRules`. `CLDBRN-AWS-TAGGING-1` needs an accessible aggregator, while `CLDBRN-AWS-LAMBDA-4` needs AWS Compute Optimizer enrollment.

Set `includeEvaluationResources` when a caller needs audit evidence for checks that did not produce findings. The
optional `result.evaluations` value contains normalized identities from the primary resource dataset supplied to each
completed live rule. Shared resource sets are emitted once and referenced by rule entries. Every selected rule is
represented as `triggered`, `passed`, or `not_applicable`; skipped rules include the reason reported by discovery.
Rule entries also carry generic rule and service metadata so callers can select checks and build their own product
views without re-querying AWS or maintaining a second copy of rule descriptions.

Evaluation resources can include provider-normalized `data` when a check needs auditable evidence beyond identity and
timestamps. For example, `CLDBRN-AWS-CONFIG-1` reports the affected resource type, current recording frequency,
observation window, configuration-item volume, current and recently deleted resource counts, estimated monthly
reduction, turnover-estimate reliability, recorder scope and overrides, public continuous and daily unit prices, and any
Firewall Manager or paid service-linked recorder dependency. If bounded turnover inspection cannot decide an otherwise
eligible above-threshold review, discovery emits a diagnostic and reports the rule as `not_applicable` instead of
`passed`.

The SDK does not define product profiles, remediation effort, commands, or persistence schemas. Applications select
the discovery rules that fit their use case through `config.discovery.enabledRules` and transform the generic result
at their own product boundary.

### Lower-level helpers

If you need more control, the SDK also exposes a lower-level parser:

- `parseIaC(path)` as a standalone export when you want normalized Terraform and CloudFormation resources without running rules

The `CloudBurnClient` also exposes helper methods:

- `client.loadConfig(path?)` to resolve CloudBurn config from disk
- `client.getDiscoveryStatus()` to inspect AWS Resource Explorer readiness
- `client.listSupportedDiscoveryResourceTypes()` to inspect the AWS resource types discovery can search

## Docs

- Full docs: [cloudburn.io/docs](https://cloudburn.io/docs)
- Architecture overview: [docs/ARCHITECTURE.md](https://github.com/towardsthecloud/cloudburn/blob/main/docs/ARCHITECTURE.md)
- Rule reference: [docs/reference/rule-ids.md](https://github.com/towardsthecloud/cloudburn/blob/main/docs/reference/rule-ids.md)

## License

Apache-2.0
