# cloudburn

## Boundaries

- CLI owns the end-user command surface, output formatting, and exit-code behavior.
- `scan` is static IaC only. `discover` owns the live AWS command surface plus Resource Explorer setup and introspection commands.
- `scan` and `discover` own the user-facing config override flags: `--config`, `--enabled-rules`, and `--disabled-rules`.
- `init` must remain backward-compatible as a starter-config printer. File-writing scaffolding lives under `init config`.
- Keep scan logic, config loading, live discovery, and rule evaluation out of this package.
- Treat option names, help output, formatter shape, and exit-code behavior as user-facing compatibility points.

## Testing

- Prefer CLI-level tests that validate command behavior, serialized output, and exit-code behavior.
- Mock the SDK boundary instead of re-testing SDK internals.
- For live AWS behavior, mock `CloudBurnClient.discover()` and the discovery helper methods rather than provider internals.
