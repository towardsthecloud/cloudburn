# @cloudburn/rules — Conventions

## Rule ID Format

`CLDBRN-{PROVIDER}-{SERVICE}-{N}` — uppercase, no zero-padding, sequential per service.

Finding IDs: `{ruleId}:{resourceId}`.

## Naming Philosophy

Names describe the **policy being enforced**, not the migration path or fix action.

| Bad (migration-focused) | Good (policy-focused)                               |
| ----------------------- | --------------------------------------------------- |
| EBS gp2 to gp3          | EBS Volume Type Not Current Generation              |
| Lambda Missing ARM      | Lambda Function Not Using Cost-Optimal Architecture |

## accountId

Set `accountId` to `''` in rule evaluators — the SDK engine injects the real value post-evaluation.
