---
'@cloudburn/rules': minor
---

Add `getLiveEvaluationCoverage` to `CLDBRN-AWS-ECR-2`, `CLDBRN-AWS-ECR-3`, and `CLDBRN-AWS-LAMBDA-4` so repositories with unparsed lifecycle policies and Lambda functions without a Compute Optimizer result are reported as unknown. `AwsLambdaMemoryRecommendation` gains a required `assessment` (`AwsLambdaMemoryAssessment`) and the memory rule flags only `memory_overprovisioned` entries; custom loaders that populate this dataset must set the field.
