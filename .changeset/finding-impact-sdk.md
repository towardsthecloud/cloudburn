---
'@cloudburn/sdk': minor
---

Propagate finding `impact` through AWS discovery normalization, evaluation resource projections, and `CloudBurnClient.discover()`; normalize missing or unusable Cost Optimization Hub financial fields to `null` without invalidating otherwise complete recommendations, fill missing summary financials from compatible `GetRecommendation` detail evidence — including the distinct `costCalculationLookbackPeriodInDays` impact window — while keeping known summary values such as zero authoritative, and re-export the new financial evidence types.
