---
'@cloudburn/rules': patch
---

Live rules now build shared per-rule evaluation indexes once per evaluation instead of once per callback, and `LiveEvaluationContext` gains an optional `scratch` memo.
