# @cloudburn/sdk

## Public API

- Treat `CloudBurnScanner`, exported types, and package exports as the SDK's integration contract for scripts and downstream clients.
- Prefer additive API changes. Treat changes to exported types, runtime return shapes, or package exports as breaking until proven otherwise.
- Keep consumer-facing types on the SDK package surface and keep rule-authoring internals in `rules`.

## Integration Contracts

- Preserve stable return shapes from scanner methods and config loaders.
- Keep runtime-injected fields explicit. Rules stay pure and the engine supplies runtime context such as `accountId`.
- Design new integration points for external callers first, not only the CLI.

## Boundaries

- SDK owns config loading, IaC parsing, live discovery, rule registry assembly, and scan orchestration.
- Keep user-facing CLI concerns out of the SDK.
- Keep pure rule declarations, finding shapes, and authoring helpers in `rules`.

## Testing

- Cover `CloudBurnScanner` facade behavior directly.
- Test config behavior, orchestration flow, and provider integration seams.
- Mock provider or external boundaries instead of re-testing the CLI or downstream SDK clients.
