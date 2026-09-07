---
'@cloudburn/sdk': patch
---

Preserve CloudWatch completeness across every metric loader to prevent false idle findings. Correct Lambda's rolling 7-day window and weight duration by sample counts. Discovery evaluations now include assessed and unknown metric resource coverage and can report `unknown`; callers validating status strings must accept this value. Config metric counts and estimates remain null when evidence is unavailable.
