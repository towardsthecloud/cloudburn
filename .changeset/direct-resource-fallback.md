---
"@cloudburn/sdk": patch
---

Fix AWS Resource Explorer discovery and initialization for local-only accounts by using the selected region as the control plane, reusing existing local indexes, and falling back to local-only setup when cross-region aggregator creation is denied.
