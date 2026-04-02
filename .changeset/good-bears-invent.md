---
"@cloudburn/sdk": patch
---

Gracefully degrade AWS discovery when required datasets are throttled or otherwise unavailable by retrying longer and surfacing skipped-rule diagnostics instead of aborting the run.
