# @cloudburn/rules

## Rule Authoring

See [`docs/guides/adding-a-rule.md`](../../docs/guides/adding-a-rule.md) for the full end-to-end guide and [`docs/reference/rule-ids.md`](../../docs/reference/rule-ids.md) for ID conventions.

Package-specific constraints:

- `createRule` is mandatory for built-in rule declarations.
- Rule names must describe the policy being enforced, not the migration or fix action.
- Rules should never declare Terraform type strings, CloudFormation type strings, Resource Explorer `resourceTypes`, or loader wiring directly; the SDK registries own that mapping.
- Omit `accountId` and `region` when they are not available. Do not emit empty-string placeholders.

## Type Contracts

- Keep this package pure. No engine logic, config loading, I/O, or AWS SDK calls.
- `createRule`, `createFinding`, and `Rule` are the stable API surface for custom rule authors.
- Keep exported rule metadata, finding types, and helpers ergonomic for consumers authoring custom rules.
- Treat changes to shared metadata, helper signatures, or evaluation context types as contract changes for both the SDK and user-authored rules.

## Testing

- Keep three layers when adding implemented rules: export surface, metadata contract, and evaluator behavior.
- Test metadata completeness when adding rule packs or changing shared rule contracts.
- Test real evaluator behavior with fixture builders and asserted finding payloads, not only export presence.
- For static IaC rules, cover both Terraform-shaped and CloudFormation-shaped resources in evaluator tests.
- When changing shared helpers or metadata, add coverage that reflects downstream rule-authoring usage.
