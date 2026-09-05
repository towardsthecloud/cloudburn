# cloudburn

## Boundaries

- CLI owns the end-user command surface, output formatting, and exit-code behavior.
- `scan` is static IaC only. `discover` owns the live AWS command surface plus Resource Explorer setup and introspection commands.
- `scan` and `discover` own the user-facing config override flags: `--config`, `--enabled-rules`, and `--disabled-rules`.
- `config` owns CloudBurn config inspection and scaffolding. `--init` writes a starter file, `--print` reads the current config, and `--print-template` prints the starter YAML.
- Keep scan logic, config loading, live discovery, and rule evaluation out of this package.
- Treat option names, help output, formatter shape, and exit-code behavior as user-facing compatibility points.

## Testing

- Prefer CLI-level tests that validate command behavior, serialized output, and exit-code behavior.
- In `*.command.test.ts`, mock the SDK to isolate command wiring, formatting, and exit policies.
- In `test/e2e/`, run the built CLI in a separate process against real template fixtures. Do not mock the SDK or parsers. Keep fixtures synthetic and runs independent of AWS credentials.
- For live AWS behavior, mock `CloudBurnClient.discover()` and the discovery helper methods rather than provider internals.
