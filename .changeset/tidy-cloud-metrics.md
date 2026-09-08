---
'@cloudburn/sdk': patch
---

Batch SageMaker, NAT gateway, and VPC endpoint metrics across resource lookups to reduce CloudWatch requests while preserving complete evidence and selected resource scope. Bound pending metric work and let S3 and DynamoDB hydration workers continue as individual lookups finish.
