---
'@cloudburn/sdk': minor
---

Report unknown coverage instead of a passed evaluation for ECR lifecycle-content rules when a lifecycle policy cannot be parsed, and for the Lambda memory rule when Compute Optimizer has not analyzed a function. The Lambda memory recommendation dataset now retains every Compute Optimizer result for selected functions with a normalized `assessment`, collapsing function versions to the unqualified ARN. The shared ECR lifecycle parser accepts `sinceImagePulled` and `sinceImageTransitioned` as tagged image retention caps in both IaC and discovery scans. Both datasets bump their evidence cache versions so upgraded scans recollect instead of reusing pre-upgrade evidence.
