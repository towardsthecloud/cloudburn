---
'@cloudburn/sdk': patch
---

Reuse CloudFront list-summary price classes and modification timestamps, avoiding redundant distribution detail requests during fallback discovery. Preserve catalog selection and use bounded continuous workers for required detail lookups. Exclude unsupported tenant-only price-class evidence from both summary and detail responses to prevent false pricing findings.
