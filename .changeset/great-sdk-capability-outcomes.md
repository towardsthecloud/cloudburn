---
'@cloudburn/sdk': minor
---

Expose AWS capability metadata and live capability outcomes. `getRuleCapabilities` lists the AWS capabilities a built-in rule requires without any AWS calls, and live `discover()` results now carry a read-only `capabilities` projection that reports `available`, `partial`, `unavailable`, or `error` readiness with machine-readable reasons and account, regional, or recommendation-source scopes. Regional scopes report only Regions with observed dataset evidence and fall back to `all-regions` for an all-Region target with none; `data-unavailable` distinguishes unavailable source data from access or enrollment failures. The projection reuses already collected discovery evidence and never probes, enrolls, or mutates AWS setup.
