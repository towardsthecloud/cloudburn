---
'@cloudburn/sdk': patch
---

Include dataset attribution in discovery request telemetry, including uncached loads and shared CloudWatch batches. Report contributing datasets once per attempt and narrow attribution when retrying selected metric queries.
