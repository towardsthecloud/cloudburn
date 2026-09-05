---
'@cloudburn/sdk': patch
---

Enforce AWS request timeouts, use the discovery control region for STS account-ID resolution when the profile has no default region, and check regional indexes concurrently to reduce all-region discovery latency.

Cache regional dataset dependencies, load regions concurrently, and retain healthy-region findings when other regions fail. Exclude incomplete regional evidence from joined rules and evaluated-resource projections. Explicit targets also select the region for account and Resource Explorer control-plane calls.

Require complete CPU and both network directions before counting EC2 idle days, deduplicate daily observations, and align the observation window to complete UTC days.
