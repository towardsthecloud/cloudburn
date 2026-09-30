---
'@cloudburn/sdk': patch
---

Stop reporting Cost Explorer as having no data when an account has no SageMaker usage. SageMaker Savings Plans coverage is now read grouped by service, so such an account passes `CLDBRN-AWS-SAGEMAKER-3` and keeps `cost-explorer-access` available.
