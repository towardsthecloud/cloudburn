# @cloudburn/sdk

## Public API

- Treat `CloudBurnClient`, exported types, and package exports as the SDK's integration contract for scripts and downstream clients.
- Prefer additive API changes. Treat changes to exported types, runtime return shapes, or package exports as breaking until proven otherwise.
- Keep consumer-facing types on the SDK package surface and keep rule-authoring internals in `rules`.

## Integration Contracts

- Preserve stable return shapes from scanner methods and config loaders.
- Keep the canonical `providers -> rules -> findings` result shape stable. Rules stay pure and the SDK only regroups non-empty rule outputs under providers.
- Design new integration points for external callers first, not only the CLI.

## Boundaries

- SDK owns config loading, IaC parsing, live discovery, rule registry assembly, and scan orchestration.
- Live AWS discovery is Resource Explorer first. Build one catalog, then hydrate only the matched resources that need extra service data.
- Do not add new account-wide per-service region fan-out discoverers. Prefer extending rule `liveDiscovery` metadata and adding narrow hydrators.
- Keep user-facing CLI concerns out of the SDK.
- Keep pure rule declarations, finding shapes, and authoring helpers in `rules`.

## Testing

- Cover `CloudBurnClient` facade behavior directly.
- Test config behavior, orchestration flow, and provider integration seams.
- Mock provider or external boundaries instead of re-testing the CLI or downstream SDK clients.
- Live provider tests should split into Resource Explorer catalog tests, hydrator tests, and orchestration tests.
