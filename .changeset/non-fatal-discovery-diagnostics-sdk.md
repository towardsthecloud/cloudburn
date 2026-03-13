---
"@cloudburn/sdk": patch
---

Treat AWS service access-denied errors during live discovery hydration as non-fatal diagnostics so CloudBurn can continue evaluating other datasets instead of aborting the full discover run.
