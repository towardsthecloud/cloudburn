---
'@cloudburn/sdk': minor
---

Expose AWS capability metadata and live capability outcomes. `getRuleCapabilities` lists the AWS capabilities a built-in rule requires without any AWS calls, and live `discover()` results now carry a read-only `capabilities` projection that reports `available`, `partial`, `unavailable`, or `error` readiness with machine-readable reasons and account, regional, or recommendation-source scopes. The projection reuses already collected discovery evidence and never probes, enrolls, or mutates AWS setup.
