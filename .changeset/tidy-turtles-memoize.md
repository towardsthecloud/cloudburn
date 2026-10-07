---
'@cloudburn/sdk': patch
---

Live scans now share each rule's derived evaluation indexes between `evaluateLive` and `getLiveEvaluationCoverage` instead of building them once per callback.
