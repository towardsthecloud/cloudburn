# CloudBurn Architecture

High-level view of the monorepo. Detailed per-package diagrams live in `docs/architecture/`.

## Package Dependency Graph

```mermaid
graph LR
  CLI["cloudburn (cli)"] --> SDK["@cloudburn/sdk"]
  SDK --> Rules["@cloudburn/rules"]
```

Dependency direction is strictly left-to-right. No reverse imports. Enforced by Turborepo `boundaries` in `turbo.json`.

## Scan Data Flow

### Static (IaC) Scan

```mermaid
sequenceDiagram
  participant CLI
  participant Scanner as CloudBurnScanner
  participant Config as Config Loader
  participant Registry as Rule Registry
  participant Parser as Terraform Parser
  participant Engine as runStaticScan

  CLI->>Scanner: scanStatic(path, config?)
  Scanner->>Config: loadConfig()
  Config-->>Scanner: CloudBurnConfig
  Scanner->>Engine: runStaticScan(path, config)
  Engine->>Registry: buildRuleRegistry(config)
  Registry-->>Engine: activeRules[]
  Engine->>Parser: parseTerraform(path)
  Parser-->>Engine: IaCResource[]
  Engine->>Engine: toStaticContext(resources)
  loop Each rule where supports includes 'iac'
    Engine->>Engine: rule.evaluateStatic(context)
  end
  Engine-->>Scanner: ScanResult { providers: ProviderFindingGroup[] }
  Scanner-->>CLI: ScanResult
```

### Live (AWS Discovery) Scan

```mermaid
sequenceDiagram
  participant CLI
  participant Scanner as CloudBurnScanner
  participant Config as Config Loader
  participant Registry as Rule Registry
  participant AWS as AWS Provider
  participant Engine as runLiveScan

  CLI->>Scanner: scanLive(config?)
  Scanner->>Config: loadConfig()
  Config-->>Scanner: CloudBurnConfig
  Scanner->>Engine: runLiveScan(config)
  Engine->>Registry: buildRuleRegistry(config)
  Registry-->>Engine: activeRules[]
  Engine->>AWS: scanAwsResources(regions)
  AWS-->>Engine: LiveEvaluationContext
  loop Each rule where supports includes 'discovery'
    Engine->>Engine: rule.evaluateLive(context)
  end
  Engine-->>Scanner: ScanResult { providers: ProviderFindingGroup[] }
  Scanner-->>CLI: ScanResult
```

## Package Responsibility

| Package            | Owns                                                                        | Does NOT own                     |
| ------------------ | --------------------------------------------------------------------------- | -------------------------------- |
| `cloudburn` (cli)  | Command parsing, output formatters, exit-code behavior                      | Scanning logic, rule definitions |
| `@cloudburn/sdk`   | Scanner facade, config system, engine orchestration, parsers, AWS providers | Rule definitions, CLI concerns   |
| `@cloudburn/rules` | Rule definitions, presets, type contracts, helper utilities                 | I/O, AWS SDK calls, engine logic |

## Multi-Cloud Strategy

AWS is the active provider. Azure and GCP namespaces are scaffolded in `@cloudburn/rules` (empty typed arrays) for future expansion. Rule metadata is provider-aware (`provider: 'aws' | 'azure' | 'gcp'`).
