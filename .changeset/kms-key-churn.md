---
'@cloudburn/rules': minor
'@cloudburn/sdk': minor
'cloudburn': minor
---

Add `CLDBRN-AWS-KMS-1` to flag Regions with at least 50 enabled customer-managed KMS keys or at least 10 created during the previous full month. Add `CLDBRN-AWS-KMS-2` to flag enabled customer-managed keys that are at least 90 days old and have no recorded KMS cryptographic use during a complete 90-day tracking window. Both rules share one KMS discovery scan, keep raw aliases private, and surface incomplete metadata without treating it as proof that a key is unused.
