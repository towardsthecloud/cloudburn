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
      ruleGroup.source,
      ruleGroup.findings.length,
    );
  }
}
```

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
```

`discover()` defaults to the current AWS region. You can also target one or more explicit AWS regions with `{ target: { mode: 'regions', regions: [...] } }`. Multi-region discovery requires an AWS Resource Explorer aggregator index.

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
