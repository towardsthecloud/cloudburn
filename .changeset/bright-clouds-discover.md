---
'@cloudburn/sdk': patch
---

Enforce AWS request timeouts, use the discovery control region for STS account-ID resolution when the profile has no default region, and check regional indexes concurrently to reduce all-region discovery latency.
