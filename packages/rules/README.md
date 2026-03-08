# @cloudburn/rules

Pure rule declarations and types for Cloudburn cost optimization checks.

This package contains the rule definitions (`Rule`, `Finding`, `FindingMatch`, `ScanSource`) used by the Cloudburn scan engine. It has no I/O, no AWS SDK calls, and no engine logic. Rules return lean rule-level finding groups, and the SDK nests those groups under providers in public scan results.

## Installation

```sh
npm install @cloudburn/rules
```

## Usage

```ts
import { createFinding, createRule, type FindingMatch } from "@cloudburn/rules";

const gp2Rule = createRule({
  id: "CLDBRN-AWS-EBS-1",
  name: "EBS Volume Type Not Current Generation",
  description: "Flag EBS volumes using previous-generation gp2 type instead of gp3.",
  message: "EBS volumes should use current-generation storage.",
  provider: "aws",
  service: "ebs",
  supports: ["discovery"],
  evaluateLive: ({ ebsVolumes }) => {
    const findings: FindingMatch[] = ebsVolumes
      .filter((volume) => volume.volumeType === "gp2")
      .map((volume) => ({
        resourceId: volume.volumeId,
        region: volume.region,
      }));

    return createFinding(gp2Rule, "discovery", findings);
  },
});
```

## License

Apache-2.0
