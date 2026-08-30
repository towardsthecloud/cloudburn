---
'@cloudburn/rules': minor
'@cloudburn/sdk': minor
cloudburn: minor
---

Remove four heuristic AWS rules that could flag valid cost choices without usage evidence: disabled API Gateway caching, missing CloudWatch metric filters, configured Lambda provisioned concurrency, and ungated S3 Intelligent-Tiering. Default scans no longer report those findings, and the unused provider datasets are no longer loaded or exported.
