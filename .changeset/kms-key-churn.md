---
'@cloudburn/rules': minor
'@cloudburn/sdk': minor
---

Add `CLDBRN-AWS-KMS-1` to flag Regions with at least 50 enabled customer-managed KMS keys or at least 10 created during the previous full month. Discovery includes storage-cost, rotation, multi-Region, anonymous alias-pattern, and KMS usage-tracking evidence without exposing raw aliases or calling individual keys unused.
