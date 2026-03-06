# CloudBurn Public Architecture

## Purpose

This document describes architecture boundaries for this monorepo.

## Package Responsibility

### `cloudburn` (cli)

- Owns command parsing and user interaction.
- Owns output formatters and CI exit code behavior.
- Delegates scanning and policy logic to `@cloudburn/sdk`.

### `@cloudburn/sdk`

- Owns scanner API (`CloudBurnScanner`).
- Owns config loading/merging and engine orchestration.
- Owns IaC parser adapters and AWS live provider adapters.
- Consumes rules from `@cloudburn/rules`.

### `@cloudburn/rules`

- Owns built-in provider rule definitions and presets.
- Owns rule metadata contracts and helper utilities.
- Must not include parser/provider client/orchestration logic.

## Dependency Direction

```text
cloudburn -> @cloudburn/sdk -> @cloudburn/rules
```

## Multi-Cloud Strategy

- AWS is the active provider today.
- Azure and GCP namespaces are scaffolded for future expansion.
- Rule metadata is provider-aware to support gradual provider rollout.

## Public vs Paid Boundary

Public repo (Apache-2.0): scanner and rule engine workflows.

Paid self-hosted products (private repos): pricing engine, historical tracking, enterprise governance, and AI automation.
