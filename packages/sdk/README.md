# @cloudburn/sdk

Scan engine for Cloudburn cloud cost optimization. Handles config loading, IaC parsing, live AWS discovery, rule evaluation, and orchestration.

## Installation

```sh
npm install @cloudburn/sdk
```

## Usage

```ts
import { CloudBurnScanner } from "@cloudburn/sdk";

const scanner = new CloudBurnScanner();
const result = await scanner.scanStatic("./terraform");

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

## License

Apache-2.0
