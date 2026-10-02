---
'@cloudburn/rules': minor
---

Remove exports that no consumer used: `createStaticFindingMatch`, `toRuleIds`, the KMS and SageMaker Savings Plans threshold constants, `gravitonResourceTypes`, the Cost Optimization Hub resource ID and type getters, and the deprecated `ScanSource` alias (use `Source`). Rule behavior is unchanged.
