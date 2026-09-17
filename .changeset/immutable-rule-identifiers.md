---
'@cloudburn/rules': patch
---

Declare rule IDs immutable from this coordinated optimization-contract release onward: never renumber or reuse assigned IDs, including after removal. Gaps are valid and all existing IDs remain unchanged. Replace contiguous-number metadata assertions with uniqueness and positive, unpadded ID checks.

This completes the contract introduced in rules 0.34.0 / SDK 0.37.0. Intentional pre-1.0 changes from rules 0.33.x include nullable Hub financial fields, canonical recommendation identity and deterministic precedence, and purchase-family-specific Savings Plans namespaces. Unknown money has no amount; it is never zero. Findings carry optional recommendation provenance and normalized impact, while rule metadata owns capability requirements. See the [SDK upgrade notes](https://github.com/towardsthecloud/cloudburn/blob/main/packages/sdk/README.md#optimization-contract-upgrade) for the coordinated application update.
