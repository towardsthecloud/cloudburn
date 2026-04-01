# Rules Architecture (`packages/rules`)

## Type Hierarchy

```mermaid
classDiagram
  class Rule {
    +string id
    +string name
    +string description
    +string message
    +provider: 'aws' | 'azure' | 'gcp'
    +string service
    +Source[] supports
    +DiscoveryDatasetKey[] discoveryDependencies?
    +StaticDatasetKey[] staticDependencies?
    +evaluateLive(ctx: LiveEvaluationContext)? Finding
    +evaluateStatic(ctx: StaticEvaluationContext)? Finding
  }

  class Finding {
    +string ruleId
    +string service
    +Source source
    +string message
    +FindingMatch[] findings
  }

  class FindingMatch {
    +string resourceId
    +string accountId?
    +string region?
    +SourceLocation location?
  }

  class LiveEvaluationContext {
    +AwsDiscoveryCatalog catalog
    +LiveResourceBag resources
  }

  class LiveResourceBag {
    +get(key: DiscoveryDatasetKey) DiscoveryDatasetMap[key]
  }

  class StaticResourceBag {
    +get(key: StaticDatasetKey) StaticDatasetMap[key]
  }

  class StaticEvaluationContext {
    +StaticResourceBag resources
  }

  Rule --> Finding : produces
  Finding --> FindingMatch : contains
  Rule --> LiveEvaluationContext : evaluateLive input
  LiveEvaluationContext --> LiveResourceBag : contains
  Rule --> StaticEvaluationContext : evaluateStatic input
  StaticEvaluationContext --> StaticResourceBag : contains
```

Rules return a single grouped `Finding` or `null`. The SDK regroups those rule findings under providers in the public `ScanResult`.

## Rule Assembly Chain

```mermaid
graph LR
  RuleFile["createRule({...})\nvolume-type-current-gen.ts"] --> ServiceIdx["ebsRules\nebs/index.ts"]
  ServiceIdx --> ProviderIdx["awsRules\naws/index.ts"]
  ProviderIdx --> Preset["awsCorePreset\npresets/aws-core.ts"]
  ProviderIdx --> Export["public export\nindex.ts"]
  Preset --> Export
```

## Authoring Rules

See [`docs/guides/adding-a-rule.md`](../guides/adding-a-rule.md) for the full end-to-end guide and [`docs/reference/rule-ids.md`](../reference/rule-ids.md) for the ID convention and complete rule table.

## Current Rules

See [`docs/reference/rule-ids.md`](../reference/rule-ids.md) for the complete rule table with descriptions and support modes.
