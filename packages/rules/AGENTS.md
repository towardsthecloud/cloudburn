# @cloudburn/rules

## Rule Authoring

- `createRule` is mandatory for built-in rule declarations.
- Rule IDs must use `CLDBRN-{PROVIDER}-{SERVICE}-{N}` in uppercase with no zero-padding. Never renumber existing IDs; gaps are allowed.
- Finding IDs must use `{ruleId}:{resourceId}`.
- Rule names must describe the policy being enforced, not the migration or fix action.
- Declare `supports` accurately and only implement evaluators for the supported scan modes.
- Set `accountId` to `''` in rule evaluators. The SDK injects the real value after evaluation.

## Type Contracts

- Keep this package pure. No engine logic, config loading, I/O, or AWS SDK calls.
- `createRule` and `Rule` are the stable API surface for custom rule authors.
- Keep exported rule metadata, finding types, and helpers ergonomic for consumers authoring custom rules.
- Treat changes to shared metadata, helper signatures, or evaluation context types as contract changes for both the SDK and user-authored rules.

## Testing

- Keep three layers when adding implemented rules: export surface, metadata contract, and evaluator behavior.
- Test metadata completeness when adding rule packs or changing shared rule contracts.
- Test real evaluator behavior with fixture builders and asserted finding payloads, not only export presence.
- When changing shared helpers or metadata, add coverage that reflects downstream rule-authoring usage.
