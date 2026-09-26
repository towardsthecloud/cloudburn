# CloudBurn Architecture

High-level view of the monorepo. Detailed per-package diagrams live in `docs/architecture/`.

## Package Dependency Graph

```mermaid
graph LR
  CLI["cloudburn (cli)"] --> SDK["@cloudburn/sdk"]
  Action["@cloudburn/action"] --> SDK
  MCP["@cloudburn/mcp"] --> SDK
  SDK --> Rules["@cloudburn/rules"]
```

Dependency direction is strictly left-to-right. No reverse imports. Enforced by Turborepo `boundaries` in `turbo.json`.

## Scan Data Flow

### Static (IaC) Scan

```mermaid
sequenceDiagram
  participant CLI
  participant Scanner as CloudBurnClient
  participant Config as Config Loader
  participant Registry as Rule Registry
  participant Parser as IaC Parser
  participant Engine as runStaticScan

  CLI->>Scanner: scanStatic(path, config?, { configPath? })
  Scanner->>Config: loadConfig()
  Config-->>Scanner: CloudBurnConfig
  Scanner->>Engine: runStaticScan(path, config)
  Engine->>Registry: buildRuleRegistry(config, 'iac')
  Registry-->>Engine: activeRules[]
  Engine->>Engine: collect staticDependencies
  Engine->>Parser: parseIaCWithDiagnostics(path, required sourceKinds)
  Parser-->>Engine: resources + resource suppressions + skipped-file diagnostics
  Engine->>Engine: build StaticResourceBag
  loop Each rule where supports includes 'iac'
    Engine->>Engine: rule.evaluateStatic(context)
  end
  Engine->>Engine: partition active and suppressed resource matches
  Engine-->>Scanner: ScanResult { providers, suppressed?, diagnostics? }
  Scanner-->>CLI: ScanResult
```

### Live (AWS Discovery) Scan

```mermaid
sequenceDiagram
  participant CLI
  participant Scanner as CloudBurnClient
  participant Config as Config Loader
  participant Registry as Rule Registry
  participant AWS as AWS Provider
  participant Engine as runLiveScan

  CLI->>Scanner: discover({ target, config?, configPath? })
  Scanner->>Config: loadConfig()
  Config-->>Scanner: CloudBurnConfig
  Scanner->>Engine: runLiveScan(config, target)
  Engine->>Registry: buildRuleRegistry(config, 'discovery')
  Registry-->>Engine: activeRules[]
  Engine->>AWS: discoverAwsResources(target, activeRules)
  AWS-->>Engine: LiveEvaluationContext
  loop Each rule where supports includes 'discovery'
    Engine->>Engine: rule.evaluateLive(context)
  end
  Engine-->>Scanner: ScanResult { providers: ProviderFindingGroup[] }
  Scanner-->>CLI: ScanResult
```

## Package Responsibility

| Package             | Owns                                                                          | Does NOT own                            |
| ------------------- | ----------------------------------------------------------------------------- | --------------------------------------- |
| `cloudburn` (cli)   | Command parsing, output formatters, exit-code behavior                        | Scanning logic, rule definitions        |
| `@cloudburn/action` | GitHub Action manifest, inputs, annotations, PR comment, bundled distribution | Scanning logic, live discovery, the CLI |
| `@cloudburn/mcp`    | Stdio MCP server tools, agent plugin manifests, skill, plugin build           | Scanning logic, AWS setup, the CLI      |
| `@cloudburn/sdk`    | Scanner facade, config system, engine orchestration, parsers, AWS providers   | Rule definitions, CLI concerns          |
| `@cloudburn/rules`  | Rule definitions, presets, type contracts, helper utilities                   | I/O, AWS SDK calls, engine logic        |

The action is a private distribution package, not a published npm library. It consumes `scanStatic` like the CLI and
ships the JavaScript bundle and WASM parser through a dedicated `towardsthecloud/cloudburn-action` repository.
Build metadata stays in this workspace; see [generated-file ownership](reference/generated-files.md).
Repository provisioning, Marketplace listing, and published-action verification are separate
[release prerequisites](guides/releasing.md#github-action-sync), not established by a passing source build.

The MCP server is published to npm as `@cloudburn/mcp` and runs locally over stdio, so agents scan workspace files
and use the user's own AWS credentials; its tools are read-only wrappers over `scanStatic`, `discover`,
`getDiscoveryStatus`, and rule metadata. The package also owns the agent plugin: one folder with Claude Code and
Agent Plugins manifests, MCP launchers pinned to the exact server version, and a skill. Releases copy the built
plugin to the public `towardsthecloud/cloudburn-plugin` repository, the source for Claude Code and Codex
marketplaces, skills.sh, and Anthropic's plugin directory. See [agent plugin sync](guides/releasing.md#agent-plugin-sync).

Static IaC scans and live AWS discovery now follow the same dataset-driven pattern. Static rules declare `staticDependencies`; live rules declare required `discoveryDependencies` and may declare `optionalDiscoveryDependencies` when supporting evidence must not block evaluation. The SDK resolves these into normalized datasets exposed through `StaticResourceBag` and `LiveResourceBag`. The CLI keeps `scan` static-only and uses `discover` for live AWS evaluation and setup flows.

## Multi-Cloud Strategy

AWS is the active provider. Azure and GCP namespaces are scaffolded in `@cloudburn/rules` (empty typed arrays) for future expansion. Rule metadata is provider-aware (`provider: 'aws' | 'azure' | 'gcp'`).
