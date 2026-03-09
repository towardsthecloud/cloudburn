# @cloudburn/sdk

Scan engine for Cloudburn cloud cost optimization. Handles config loading, IaC parsing, live AWS discovery, rule evaluation, and orchestration.

## Installation

```sh
npm install @cloudburn/sdk
```

## Usage

```ts
import { CloudBurnScanner, parseIaC } from "@cloudburn/sdk";

const scanner = new CloudBurnScanner();
const result = await scanner.scanStatic("./iac");

const resources = await parseIaC("./template.yaml");
console.log(resources.length);

for (const providerGroup of result.providers) {
  for (const ruleFindingGroup of providerGroup.rules) {
    console.log(
      providerGroup.provider,
      ruleFindingGroup.ruleId,
      ruleFindingGroup.service,
      ruleFindingGroup.source,
      ruleFindingGroup.message,
      ruleFindingGroup.findings.length,
    );
  }
}
```

`scanStatic(path)` is the main high-level entrypoint. `parseIaC(path)` is the
lower-level helper when you want normalized Terraform and CloudFormation
resources without running the rule engine.

## License

Apache-2.0
