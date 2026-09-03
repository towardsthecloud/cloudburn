---
'@cloudburn/sdk': patch
cloudburn: patch
---

Load Secrets Manager last-access metadata through paginated `ListSecrets` calls so read-only roles can evaluate unused-secret rules without `DescribeSecret` access.
