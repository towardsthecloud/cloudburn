# SDK Architecture (`packages/sdk`)

## CloudBurnScanner Facade

```mermaid
classDiagram
  class CloudBurnScanner {
    +scanStatic(path: string, config?: Partial~CloudBurnConfig~) Promise~ScanResult~
    +scanLive(config?: Partial~CloudBurnConfig~) Promise~ScanResult~
    +loadConfig(path?: string) Promise~CloudBurnConfig~
  }
```

`CloudBurnScanner` is the primary public entry point. The SDK also exposes
`parseIaC(path)` as a lower-level helper for callers that want autodetected
Terraform and CloudFormation resources without running rule evaluation.

## Engine Flow

```mermaid
graph TD
  subgraph Static["runStaticScan(path, config)"]
    SR[buildRuleRegistry] --> SP[parseIaC]
    SP --> SC[toStaticContext]
    SC --> SE["rule.evaluateStatic() => Finding | null"]
    SE --> SG[groupFindingsByProvider]
    SG --> SOut["ScanResult { providers: ProviderFindingGroup[] }"]
  end

  subgraph Live["runLiveScan(config)"]
    LR[buildRuleRegistry] --> LA[scanAwsResources]
    LA --> LE["rule.evaluateLive() => Finding | null"]
    LE --> LG[groupFindingsByProvider]
    LG --> LOut["ScanResult { providers: ProviderFindingGroup[] }"]
  end
```

### Static Scan

1. Build the rule registry.
2. Auto-detect Terraform and CloudFormation inputs and parse them into normalized `IaCResource[]`.
3. Build `StaticEvaluationContext` with `iacResources`.
4. Invoke each static evaluator.
5. Group non-null rule findings under `providers -> rules -> findings`.

### Live Scan

1. Build the rule registry.
2. Discover live AWS resources. AWS service discoverers run concurrently after shared region/account resolution.
3. Build `LiveEvaluationContext`.
4. Invoke each live evaluator.
5. Group non-null rule findings under `providers -> rules -> findings`.

Current live-discovery behavior:
- `scanAwsResources()` degrades to partial results when an AWS discoverer fails, returning an empty list for the failed discoverer instead of aborting the whole scan.
- Lambda discovery also degrades to partial results per region, so a failed `ListFunctions` call only drops that region's Lambda resources.
- Missing Lambda `Architectures` values from AWS are normalized to `['x86_64']`, matching the AWS default architecture.
- Live scans still require shared AWS identity access (`sts:GetCallerIdentity`) plus per-service read permissions such as `ec2:DescribeVolumes` and `lambda:ListFunctions`.

## Public Result Shape

```ts
type ScanResult = {
  providers: Array<{
    provider: 'aws' | 'azure' | 'gcp';
    rules: Array<{
      ruleId: string;
      service: string;
      source: ScanSource;
      message: string;
      findings: FindingMatch[];
    }>;
  }>;
};
```

- Empty scans return `{ providers: [] }`.
- `source`, `service`, and `message` are carried on each rule group, not on `ScanResult`.
- IaC matches may include `location`.

## Parser Layer

```mermaid
graph LR
  Path["file or directory"] --> PI["parseIaC(path)"]
  PI --> TF["parseTerraform(path)"]
  PI --> CFN["parseCloudFormation(path)"]
  TF --> Walk["recursive walk\n(skips .git, .terraform, node_modules)"]
  CFN --> Walk
  Walk --> HCL["@cdktf/hcl2json / YAML+JSON parse"]
  HCL --> Extract["extract AWS Terraform blocks\nand AWS:: CloudFormation resources"]
  Extract --> IaC["IaCResource[]"]
```

`parseIaC(path)` accepts a Terraform file, CloudFormation template, or directory.
It aggregates both parsers, ignores unsupported files, and preserves stable
ordering for mixed directories. `IaCResource` carries normalized attributes plus
optional block- and attribute-level source locations for parsed AWS Terraform
and CloudFormation resources. Rules filter that shared catalog by source-native
resource type such as `aws_ebs_volume`, `aws_instance`, or `AWS::EC2::Volume`.

## Provider Layer

`buildRuleRegistry(config)` still decides which rules are active. The engines use `rule.provider` to place each non-null rule finding into the correct top-level provider group in `ScanResult`.
