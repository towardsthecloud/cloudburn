# cloudburn

## Boundaries

- CLI owns the end-user command surface, output formatting, and exit-code behavior.
- Keep scan logic, config loading, live discovery, and rule evaluation out of this package.
- Treat option names, help output, formatter shape, and exit-code behavior as user-facing compatibility points.
- Prefer additive command changes over breaking flag or output changes.

## Testing

- Prefer CLI-level tests that validate command behavior, serialized output, and exit-code behavior.
- Mock the SDK boundary instead of re-testing SDK internals.
