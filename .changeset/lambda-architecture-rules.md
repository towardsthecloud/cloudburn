---
"@cloudburn/rules": minor
---

Implement evaluators for CLDBRN-AWS-LAMBDA-1 (Lambda Cost-Optimal Architecture). The rule flags Lambda functions using x86_64 and recommends ARM64 (Graviton2) for ~20% cost savings. Adds `AwsLambdaFunction` type and extends `LiveEvaluationContext`.
