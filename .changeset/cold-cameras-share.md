---
"cloudburn": minor
"@cloudburn/sdk": patch
---

Expose built-in rule metadata through the SDK and enrich `cloudburn rules list` to group rules by provider and service.

`cloudburn rules list` now shows `RULE_ID: description` in human-readable output and returns rule metadata objects in JSON instead of bare rule ID strings.
